import {
  AnalysisAbortedError,
  CriticalStepError,
  type Logger,
  runPipeline,
  type StepEvent,
} from "@repolens/analysis";
import {
  analyses,
  analysisSteps,
  type Database,
  repositories,
  sessions,
  type TokenCipher,
} from "@repolens/database";
import { LIMITS, STEP_KEYS, STEP_LABELS } from "@repolens/shared";
import { and, desc, eq, gt } from "drizzle-orm";
import { CloneError, cloneRepository } from "./clone";
import { persistResult, setAnalysisStatus, updateStep } from "./persist";

export interface RunDeps {
  db: Database;
  cipher: TokenCipher | null;
  workdir: string;
  logger: Logger;
  network: boolean;
  /** Override for tests. */
  timeoutMs?: number;
}

/**
 * Looks up a usable GitHub token for cloning a private repository: the requesting user's most
 * recent unexpired session. Public repositories are cloned anonymously.
 */
async function cloneTokenFor(
  deps: RunDeps,
  repo: typeof repositories.$inferSelect,
  requestedByUserId: string | null,
): Promise<string | null> {
  if (!repo.isPrivate || !deps.cipher) return null;
  const userId = requestedByUserId ?? repo.ownerUserId;
  if (!userId) return null;
  const [session] = await deps.db
    .select({ encryptedGithubToken: sessions.encryptedGithubToken })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.lastSeenAt))
    .limit(1);
  if (!session) return null;
  return deps.cipher.decrypt(session.encryptedGithubToken);
}

/** Ensures a step row exists for every step key (older analyses may predate new steps). */
export async function ensureSteps(db: Database, analysisId: string): Promise<void> {
  await db
    .insert(analysisSteps)
    .values(
      STEP_KEYS.map((key, position) => ({ analysisId, key, label: STEP_LABELS[key], position })),
    )
    .onConflictDoNothing();
}

export async function runAnalysis(
  deps: RunDeps,
  analysisId: string,
  ref?: string | null,
): Promise<void> {
  const { db, logger } = deps;
  const [row] = await db
    .select({ analysis: analyses, repository: repositories })
    .from(analyses)
    .innerJoin(repositories, eq(analyses.repositoryId, repositories.id))
    .where(eq(analyses.id, analysisId))
    .limit(1);
  if (!row) {
    logger.warn({ analysisId }, "analysis not found; dropping job");
    return;
  }
  if (row.analysis.status === "completed" || row.analysis.status === "cancelled") {
    logger.info({ analysisId, status: row.analysis.status }, "analysis already finished; skipping");
    return;
  }

  const startedAt = new Date();
  const controller = new AbortController();
  const timeoutMs = deps.timeoutMs ?? LIMITS.analysisTimeoutMs;
  const timer = setTimeout(
    () =>
      controller.abort(
        new Error(`Analysis exceeded the ${Math.round(timeoutMs / 60_000)} minute limit`),
      ),
    timeoutMs,
  );
  await ensureSteps(db, analysisId);
  await setAnalysisStatus(db, analysisId, "running", { startedAt, error: null });
  await updateStep(db, analysisId, "clone", {
    status: "running",
    startedAt,
    finishedAt: null,
    error: null,
  });

  let cleanup: (() => Promise<void>) | null = null;
  try {
    const token = await cloneTokenFor(deps, row.repository, row.analysis.requestedByUserId);
    const cloneStarted = Date.now();
    const clone = await cloneRepository({
      cloneUrl: row.repository.cloneUrl,
      token,
      ref: ref ?? row.analysis.branch ?? null,
      workdir: deps.workdir,
      signal: controller.signal,
      logger,
    });
    cleanup = clone.cleanup;
    await updateStep(db, analysisId, "clone", {
      status: "completed",
      finishedAt: new Date(),
      durationMs: Date.now() - cloneStarted,
      detail: `${clone.commitSha.slice(0, 7)}${clone.branch ? ` on ${clone.branch}` : ""}`,
    });
    await db
      .update(analyses)
      .set({ commitSha: clone.commitSha, commitDate: clone.commitDate, branch: clone.branch })
      .where(eq(analyses.id, analysisId));

    const onStep = async (e: StepEvent) => {
      const now = new Date();
      if (e.status === "running")
        await updateStep(db, analysisId, e.key, {
          status: "running",
          startedAt: now,
          finishedAt: null,
          error: null,
        });
      else
        await updateStep(db, analysisId, e.key, {
          status: e.status,
          finishedAt: now,
          durationMs: e.durationMs ?? null,
          detail: e.detail ?? null,
          error: e.error ?? null,
        });
    };
    const result = await runPipeline({
      rootDir: clone.dir,
      signal: controller.signal,
      logger,
      fetch: deps.network ? globalThis.fetch : null,
      onStep,
    });
    await persistResult(db, {
      analysisId,
      result,
      commitSha: clone.commitSha,
      commitDate: clone.commitDate,
      branch: clone.branch,
      startedAt,
    });
    logger.info(
      {
        analysisId,
        healthScore: result.metrics.scoring?.healthScore,
        findings: result.findings.length,
      },
      "analysis completed",
    );
  } catch (err) {
    const message = describeFailure(err);
    logger.error({ analysisId, err: message }, "analysis failed");
    const finishedAt = new Date();
    if (err instanceof CloneError) {
      await updateStep(db, analysisId, "clone", { status: "failed", finishedAt, error: message });
    }
    if (err instanceof CriticalStepError) {
      await updateStep(db, analysisId, err.step, { status: "failed", finishedAt, error: message });
    }
    // Steps still pending are marked skipped so the UI does not show them as waiting forever.
    await db
      .update(analysisSteps)
      .set({ status: "skipped" })
      .where(and(eq(analysisSteps.analysisId, analysisId), eq(analysisSteps.status, "pending")));
    await db
      .update(analysisSteps)
      .set({ status: "failed", finishedAt, error: message })
      .where(and(eq(analysisSteps.analysisId, analysisId), eq(analysisSteps.status, "running")));
    await setAnalysisStatus(db, analysisId, "failed", {
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      error: message,
    });
  } finally {
    clearTimeout(timer);
    if (cleanup) await cleanup().catch((e) => logger.warn({ err: String(e) }, "cleanup failed"));
  }
}

export function describeFailure(err: unknown): string {
  if (err instanceof CloneError) return err.message;
  if (err instanceof AnalysisAbortedError) return err.message;
  if (err instanceof CriticalStepError) return err.message;
  if (err instanceof Error) return err.message.slice(0, 500);
  return String(err).slice(0, 500);
}
