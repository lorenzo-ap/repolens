import {
  type AnalysisRow,
  analyses,
  analysisSteps,
  findings,
  type RepositoryRow,
  repositories,
} from "@repolens/database";
import {
  ANALYZER_VERSION,
  type AnalysisDetail,
  type AnalysisSummary,
  CATEGORIES,
  type CompareResponse,
  type HistoryResponse,
  LIMITS,
  type MetricDelta,
  type MetricsDocument,
  type MetricsResponse,
  STEP_KEYS,
  STEP_LABELS,
} from "@repolens/shared";
import { and, asc, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import type { AppContext, Viewer } from "../context";
import { ConflictError, LimitExceededError, NotFoundError } from "../lib/errors";
import {
  serializeAnalysis,
  serializeFinding,
  serializeRepository,
  serializeStep,
} from "../serializers";
import { analysisSummaryColumns, findReadableRepositoryById } from "./repositories";

/** Creates a queued analysis, or returns the active one if the repository is already being analyzed. */
export async function startAnalysis(
  ctx: AppContext,
  viewer: Viewer,
  repo: RepositoryRow,
): Promise<{ analysis: AnalysisSummary; created: boolean }> {
  if (repo.sizeKb !== null && repo.sizeKb > LIMITS.maxRepoSizeKb) {
    throw new LimitExceededError(
      `Repository is ${(repo.sizeKb / 1024).toFixed(0)} MB; the limit is ${(LIMITS.maxRepoSizeKb / 1024).toFixed(0)} MB`,
    );
  }
  const [active] = await ctx.db
    .select()
    .from(analyses)
    .where(and(eq(analyses.repositoryId, repo.id), inArray(analyses.status, ["queued", "running"])))
    .orderBy(desc(analyses.createdAt))
    .limit(1);
  if (active) return { analysis: serializeAnalysis(active), created: false };

  await assertWithinQuota(ctx, viewer);

  const created = await ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(analyses)
      .values({
        repositoryId: repo.id,
        requestedByUserId: viewer.user.id,
        status: "queued",
        branch: repo.defaultBranch,
        analyzerVersion: ANALYZER_VERSION,
      })
      .returning();
    if (!row) throw new Error("failed to create analysis");
    await tx.insert(analysisSteps).values(
      STEP_KEYS.map((key, position) => ({
        analysisId: row.id,
        key,
        label: STEP_LABELS[key],
        position,
      })),
    );
    return row;
  });
  try {
    await ctx.queue.enqueue({ analysisId: created.id });
  } catch (err) {
    await ctx.db
      .update(analyses)
      .set({ status: "failed", error: "Could not enqueue analysis job", finishedAt: new Date() })
      .where(eq(analyses.id, created.id));
    throw err;
  }
  ctx.logger.info({ analysisId: created.id, repositoryId: repo.id }, "analysis queued");
  return { analysis: serializeAnalysis(created), created: true };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Caps what one account can cost us: how many analyses it can have in flight at once, and how
 * many it can start in any rolling 24 hours. Both are configurable per deployment.
 *
 * Only analyses the user asked for are counted. The demo repository's analyses are produced by
 * the seed with no requesting user, and `assertCanManage` refuses to start one through the API,
 * so browsing or re-reading the demo can never consume anyone's quota.
 *
 * Deliberately checked after the "this repository is already being analyzed" short-circuit, so
 * clicking Analyze twice on the same repository costs nothing.
 */
async function assertWithinQuota(ctx: AppContext, viewer: Viewer): Promise<void> {
  const { concurrentAnalyses, analysesPerDay } = ctx.config.quotas;
  const since = new Date(Date.now() - DAY_MS);
  // A raw Date inside an sql`` template reaches the driver unserialized, so bind the timestamp
  // as text and cast it. The comparison in `where` below goes through drizzle and is fine.
  const sinceIso = since.toISOString();
  const [counts] = await ctx.db
    .select({
      active: sql<number>`count(*) filter (where ${analyses.status} in ('queued', 'running'))`,
      recent: sql<number>`count(*) filter (where ${analyses.createdAt} >= ${sinceIso}::timestamptz)`,
      // Raw sql`` bypasses drizzle's column decoding, so this arrives as whatever the driver
      // produced — a Date or a timestamp string depending on the column's OID mapping.
      oldestRecent: sql<
        Date | string | null
      >`min(${analyses.createdAt}) filter (where ${analyses.createdAt} >= ${sinceIso}::timestamptz)`,
    })
    .from(analyses)
    .where(
      and(
        eq(analyses.requestedByUserId, viewer.user.id),
        // Bounded on purpose: without this the count walks every analysis the user ever ran.
        or(inArray(analyses.status, ["queued", "running"]), gte(analyses.createdAt, since)),
      ),
    );

  const active = Number(counts?.active ?? 0);
  if (active >= concurrentAnalyses) {
    throw new LimitExceededError(
      `You already have ${active} ${active === 1 ? "analysis" : "analyses"} queued or running, ` +
        `and the limit is ${concurrentAnalyses}. Wait for one to finish, or cancel it, and try again.`,
    );
  }

  const recent = Number(counts?.recent ?? 0);
  if (recent >= analysesPerDay) {
    throw new LimitExceededError(
      `You have started ${recent} analyses in the last 24 hours, which is the limit. ` +
        `You can start another one ${describeReset(counts?.oldestRecent ?? null)}.`,
    );
  }
}

/** Turns the oldest analysis inside the window into "in about 3 hours". */
function describeReset(oldest: Date | string | null): string {
  if (!oldest) return "later today";
  const at = oldest instanceof Date ? oldest : new Date(oldest);
  if (Number.isNaN(at.getTime())) return "later today";
  const ms = at.getTime() + DAY_MS - Date.now();
  if (ms <= 60_000) return "in a moment";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `in about ${hours} hour${hours === 1 ? "" : "s"}`;
}

/** Loads an analysis together with its repository, enforcing the repository's read rule. */
export async function loadAnalysis(
  ctx: AppContext,
  viewer: Viewer | null,
  analysisId: string,
): Promise<{ analysis: AnalysisRow; repository: RepositoryRow }> {
  const [row] = await ctx.db.select().from(analyses).where(eq(analyses.id, analysisId)).limit(1);
  if (!row) throw new NotFoundError("Analysis");
  const repository = await findReadableRepositoryById(ctx, viewer, row.repositoryId);
  return { analysis: row, repository };
}

export async function analysisDetail(
  ctx: AppContext,
  viewer: Viewer | null,
  analysisId: string,
): Promise<AnalysisDetail> {
  const { analysis, repository } = await loadAnalysis(ctx, viewer, analysisId);
  const steps = await ctx.db
    .select()
    .from(analysisSteps)
    .where(eq(analysisSteps.analysisId, analysisId))
    .orderBy(asc(analysisSteps.position));
  const [previous] = await ctx.db
    .select({ id: analyses.id })
    .from(analyses)
    .where(
      and(
        eq(analyses.repositoryId, repository.id),
        eq(analyses.status, "completed"),
        lt(analyses.createdAt, analysis.createdAt),
      ),
    )
    .orderBy(desc(analyses.createdAt))
    .limit(1);
  return {
    analysis: serializeAnalysis(analysis),
    repository: serializeRepository(repository, viewer?.user.id ?? null),
    steps: steps.map(serializeStep),
    previousAnalysisId: previous?.id ?? null,
  };
}

export async function listAnalyses(
  ctx: AppContext,
  repo: RepositoryRow,
  limit: number,
): Promise<AnalysisSummary[]> {
  const rows = await ctx.db
    .select(analysisSummaryColumns)
    .from(analyses)
    .where(eq(analyses.repositoryId, repo.id))
    .orderBy(desc(analyses.createdAt))
    .limit(limit);
  return rows.map(serializeAnalysis);
}

export async function metricsOf(
  ctx: AppContext,
  viewer: Viewer | null,
  analysisId: string,
): Promise<MetricsResponse> {
  const { analysis } = await loadAnalysis(ctx, viewer, analysisId);
  if (!analysis.metrics) throw new NotFoundError("Metrics");
  return { analysisId, metrics: analysis.metrics };
}

export async function historyOf(
  ctx: AppContext,
  viewer: Viewer | null,
  analysisId: string,
): Promise<HistoryResponse> {
  const { analysis } = await loadAnalysis(ctx, viewer, analysisId);
  const g = analysis.metrics?.gitHistory;
  return {
    analysisId,
    hotspots: g?.hotspots ?? [],
    authors: g?.authors ?? [],
    commitsPerWeek: g?.commitsPerWeek ?? [],
    busFactor: g?.busFactor ?? 0,
    commits: g?.commits ?? 0,
  };
}

export async function cancelAnalysis(ctx: AppContext, analysis: AnalysisRow): Promise<void> {
  if (analysis.status !== "queued")
    throw new ConflictError("Only queued analyses can be cancelled");
  await ctx.db
    .update(analyses)
    .set({ status: "cancelled", finishedAt: new Date(), error: "Cancelled by user" })
    .where(and(eq(analyses.id, analysis.id), eq(analyses.status, "queued")));
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

interface DeltaSpec {
  key: string;
  label: string;
  higherIsBetter: boolean | null;
  pick: (m: MetricsDocument) => number | null | undefined;
}

const DELTA_SPECS: DeltaSpec[] = [
  { key: "files", label: "Files", higherIsBetter: null, pick: (m) => m.structure?.totalFiles },
  { key: "lines", label: "Lines", higherIsBetter: null, pick: (m) => m.structure?.totalLines },
  {
    key: "functions",
    label: "Functions",
    higherIsBetter: null,
    pick: (m) => m.complexity?.functions,
  },
  {
    key: "avgCyclomatic",
    label: "Avg cyclomatic complexity",
    higherIsBetter: false,
    pick: (m) => m.complexity?.avgCyclomatic,
  },
  {
    key: "p90Cyclomatic",
    label: "P90 cyclomatic complexity",
    higherIsBetter: false,
    pick: (m) => m.complexity?.p90Cyclomatic,
  },
  {
    key: "maxCyclomatic",
    label: "Max cyclomatic complexity",
    higherIsBetter: false,
    pick: (m) => m.complexity?.maxCyclomatic,
  },
  {
    key: "anyCount",
    label: "Explicit any",
    higherIsBetter: false,
    pick: (m) => m.typescript?.anyCount,
  },
  {
    key: "tsIgnore",
    label: "@ts-ignore",
    higherIsBetter: false,
    pick: (m) => m.typescript?.tsIgnoreCount,
  },
  {
    key: "unusedExports",
    label: "Unused exports",
    higherIsBetter: false,
    pick: (m) => m.typescript?.unusedExports,
  },
  {
    key: "longFunctions",
    label: "Long functions",
    higherIsBetter: false,
    pick: (m) => m.quality?.longFunctions,
  },
  {
    key: "duplicateBlocks",
    label: "Duplicate blocks",
    higherIsBetter: false,
    pick: (m) => m.quality?.duplicateBlocks,
  },
  {
    key: "emptyCatch",
    label: "Empty catch blocks",
    higherIsBetter: false,
    pick: (m) => m.quality?.emptyCatchBlocks,
  },
  {
    key: "cycles",
    label: "Dependency cycles",
    higherIsBetter: false,
    pick: (m) => m.architecture?.cycleCount,
  },
  {
    key: "cycleFiles",
    label: "Files in cycles",
    higherIsBetter: false,
    pick: (m) => m.architecture?.cycleFileCount,
  },
  {
    key: "direct",
    label: "Direct dependencies",
    higherIsBetter: null,
    pick: (m) => m.dependencies?.direct,
  },
  {
    key: "resolved",
    label: "Resolved packages",
    higherIsBetter: null,
    pick: (m) => m.dependencies?.resolvedPackages,
  },
  {
    key: "vulns",
    label: "Known vulnerabilities",
    higherIsBetter: false,
    pick: (m) => {
      const v = m.dependencies?.vulnerabilities;
      return v ? v.critical + v.high + v.moderate + v.low : null;
    },
  },
  {
    key: "testFiles",
    label: "Test files",
    higherIsBetter: true,
    pick: (m) => m.testing?.testFiles,
  },
  {
    key: "testCases",
    label: "Test cases",
    higherIsBetter: true,
    pick: (m) => m.testing?.testCases,
  },
  {
    key: "testRatio",
    label: "Test-to-source ratio",
    higherIsBetter: true,
    pick: (m) => m.testing?.testToSourceRatio,
  },
  {
    key: "authors",
    label: "Authors (last 400 commits)",
    higherIsBetter: null,
    pick: (m) => m.gitHistory?.authorCount,
  },
  {
    key: "busFactor",
    label: "Bus factor",
    higherIsBetter: true,
    pick: (m) => m.gitHistory?.busFactor,
  },
];

export async function compareAnalyses(
  ctx: AppContext,
  viewer: Viewer | null,
  baseId: string,
  targetId: string,
): Promise<CompareResponse> {
  const base = await loadAnalysis(ctx, viewer, baseId);
  const target = await loadAnalysis(ctx, viewer, targetId);
  if (base.repository.id !== target.repository.id)
    throw new ConflictError("Analyses belong to different repositories");
  if (base.analysis.status !== "completed" || target.analysis.status !== "completed")
    throw new ConflictError("Both analyses must be completed");

  const [baseFindings, targetFindings] = await Promise.all([
    ctx.db.select().from(findings).where(eq(findings.analysisId, baseId)),
    ctx.db.select().from(findings).where(eq(findings.analysisId, targetId)),
  ]);
  const baseFp = new Set(baseFindings.map((f) => f.fingerprint));
  const targetFp = new Set(targetFindings.map((f) => f.fingerprint));
  const newFindings = targetFindings.filter((f) => !baseFp.has(f.fingerprint));
  const resolved = baseFindings.filter((f) => !targetFp.has(f.fingerprint));
  const unchangedCount = targetFindings.length - newFindings.length;

  const scoreDeltas: CompareResponse["scoreDeltas"] = [
    { category: "health", before: base.analysis.healthScore, after: target.analysis.healthScore },
    ...CATEGORIES.map((c) => ({
      category: c,
      before: base.analysis.categoryScores?.[c] ?? null,
      after: target.analysis.categoryScores?.[c] ?? null,
    })),
  ];
  const bm = base.analysis.metrics;
  const tm = target.analysis.metrics;
  const metricDeltas: MetricDelta[] = DELTA_SPECS.map((s) => ({
    key: s.key,
    label: s.label,
    before: bm ? (s.pick(bm) ?? null) : null,
    after: tm ? (s.pick(tm) ?? null) : null,
    higherIsBetter: s.higherIsBetter,
  }));
  const bySeverity = (a: typeof findings.$inferSelect, b: typeof findings.$inferSelect) =>
    a.severityRank - b.severityRank || (a.filePath ?? "").localeCompare(b.filePath ?? "");
  return {
    base: serializeAnalysis(base.analysis),
    target: serializeAnalysis(target.analysis),
    scoreDeltas,
    findings: {
      new: newFindings.sort(bySeverity).slice(0, 200).map(serializeFinding),
      resolved: resolved.sort(bySeverity).slice(0, 200).map(serializeFinding),
      unchangedCount,
    },
    metricDeltas,
  };
}

export { repositories };
