/**
 * Seeds the public demo: clones a real repository and runs the real analysis pipeline at several
 * historical commits so the dashboard, findings, architecture and history views show genuine data.
 *
 * Usage: pnpm seed:demo            (env: DATABASE_URL, DEMO_REPO_OWNER, DEMO_REPO_NAME, DEMO_COMMITS)
 */
import { analyses, analysisSteps, createDatabase, repositories } from "@repolens/database";
import { ANALYZER_VERSION, STEP_KEYS, STEP_LABELS } from "@repolens/shared";
import { and, eq } from "drizzle-orm";
import pino from "pino";
import { loadConfig } from "./config";
import { runAnalysis } from "./run-analysis";

const config = loadConfig();
const logger = pino({
  level: config.logLevel,
  transport: { target: "pino-pretty", options: { colorize: true } },
});

const owner = process.env.DEMO_REPO_OWNER ?? "vercel";
const name = process.env.DEMO_REPO_NAME ?? "swr";
const description = process.env.DEMO_REPO_DESCRIPTION ?? null;
const defaultBranch = process.env.DEMO_REPO_BRANCH ?? "main";
/** Oldest first. Full SHAs or branch names; the last one should be the default branch. */
const refs = (process.env.DEMO_COMMITS ?? defaultBranch)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const database = createDatabase(config.databaseUrl, { max: 4 });
const { db } = database;

try {
  const fullName = `${owner}/${name}`;
  let [repo] = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.fullName, fullName), eq(repositories.isDemo, true)))
    .limit(1);
  if (!repo) {
    [repo] = await db
      .insert(repositories)
      .values({
        ownerUserId: null,
        githubId: null,
        owner,
        name,
        fullName,
        defaultBranch,
        isPrivate: false,
        isDemo: true,
        description,
        htmlUrl: `https://github.com/${fullName}`,
        cloneUrl: `https://github.com/${fullName}.git`,
      })
      .returning();
  }
  if (!repo) throw new Error("failed to create demo repository");
  logger.info({ repositoryId: repo.id, fullName, refs }, "seeding demo repository");

  for (const ref of refs) {
    const existing = await db
      .select({ id: analyses.id, status: analyses.status })
      .from(analyses)
      .where(
        and(
          eq(analyses.repositoryId, repo.id),
          eq(analyses.commitSha, ref),
          eq(analyses.status, "completed"),
        ),
      )
      .limit(1);
    if (existing[0]) {
      logger.info({ ref }, "already analyzed; skipping");
      continue;
    }
    const [analysis] = await db
      .insert(analyses)
      .values({
        repositoryId: repo.id,
        requestedByUserId: null,
        status: "queued",
        branch: /^[0-9a-f]{40}$/i.test(ref) ? null : ref,
        analyzerVersion: ANALYZER_VERSION,
      })
      .returning({ id: analyses.id });
    if (!analysis) throw new Error("failed to create analysis row");
    await db.insert(analysisSteps).values(
      STEP_KEYS.map((key, position) => ({
        analysisId: analysis.id,
        key,
        label: STEP_LABELS[key],
        position,
      })),
    );
    await runAnalysis(
      {
        db,
        cipher: null,
        workdir: config.workdir,
        logger: logger.child({ ref }),
        network: config.network,
      },
      analysis.id,
      ref,
    );
    const [done] = await db
      .select({ status: analyses.status, healthScore: analyses.healthScore, error: analyses.error })
      .from(analyses)
      .where(eq(analyses.id, analysis.id));
    if (done?.status !== "completed")
      throw new Error(`demo analysis for ${ref} failed: ${done?.error}`);
    logger.info({ ref, healthScore: done.healthScore }, "demo analysis completed");
  }
  logger.info("demo seed finished");
} finally {
  await database.close();
}
