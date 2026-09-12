import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { noopLogger, runPipeline } from "@repolens/analysis";
import {
  analyses,
  analysisSteps,
  createDatabase,
  findings,
  moduleEdges,
  moduleNodes,
  repositories,
} from "@repolens/database";
import { ANALYZER_VERSION } from "@repolens/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CloneError, cloneRepository } from "../clone";
import { persistResult } from "../persist";
import { ensureSteps, runAnalysis } from "../run-analysis";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://repolens:repolens@localhost:5432/repolens_test";
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "fixtures");

const database = createDatabase(DATABASE_URL, { max: 2 });
const { db } = database;
let workdir: string;

beforeAll(() => {
  workdir = mkdtempSync(join(tmpdir(), "repolens-worker-"));
});
afterAll(async () => {
  rmSync(workdir, { recursive: true, force: true });
  await database.close();
});
beforeEach(async () => {
  await database.sql`truncate table users, sessions, repositories, analyses, analysis_steps, findings, module_nodes, module_edges restart identity cascade`;
});

async function seedRepo(cloneUrl: string) {
  const [repo] = await db
    .insert(repositories)
    .values({
      owner: "acme",
      name: "widgets",
      fullName: "acme/widgets",
      defaultBranch: "main",
      htmlUrl: "https://github.com/acme/widgets",
      cloneUrl,
      isDemo: true,
    })
    .returning();
  const [analysis] = await db
    .insert(analyses)
    .values({ repositoryId: repo?.id ?? "", status: "queued", analyzerVersion: ANALYZER_VERSION })
    .returning();
  if (!repo || !analysis) throw new Error("seed failed");
  await ensureSteps(db, analysis.id);
  return { repo, analysis };
}

describe("cloneRepository", () => {
  it("rejects non-GitHub, non-https and credentialed URLs before touching the network", async () => {
    const base = { workdir, signal: new AbortController().signal, logger: noopLogger };
    await expect(
      cloneRepository({ ...base, cloneUrl: "http://github.com/a/b.git" }),
    ).rejects.toBeInstanceOf(CloneError);
    await expect(
      cloneRepository({ ...base, cloneUrl: "https://gitlab.com/a/b.git" }),
    ).rejects.toBeInstanceOf(CloneError);
    await expect(
      cloneRepository({ ...base, cloneUrl: "https://user:tok@github.com/a/b.git" }),
    ).rejects.toBeInstanceOf(CloneError);
    await expect(
      cloneRepository({ ...base, cloneUrl: "https://github.com/a/b/../c.git" }),
    ).rejects.toBeInstanceOf(CloneError);
  });
});

describe("persistResult", () => {
  it("stores findings, graph and scores for a real pipeline run", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repolens-fixture-"));
    cpSync(join(FIXTURES, "sample-app"), dir, { recursive: true });
    try {
      const result = await runPipeline({
        rootDir: dir,
        fetch: null,
        only: [
          "structure",
          "typescript",
          "quality",
          "complexity",
          "dependencies",
          "architecture",
          "testing",
        ],
      });
      const { analysis } = await seedRepo("https://github.com/acme/widgets.git");
      await persistResult(db, {
        analysisId: analysis.id,
        result,
        commitSha: "c".repeat(40),
        commitDate: new Date("2024-03-01T00:00:00Z"),
        branch: "main",
        startedAt: new Date(Date.now() - 5000),
      });
      const [row] = await db.select().from(analyses).where(eq(analyses.id, analysis.id));
      expect(row?.status).toBe("completed");
      expect(row?.healthScore).toBe(result.metrics.scoring?.healthScore);
      expect(row?.grade).toMatch(/^[A-F]$/);
      expect(row?.findingSummary?.total).toBe(result.findings.length);
      expect(row?.durationMs).toBeGreaterThan(0);
      const storedFindings = await db
        .select()
        .from(findings)
        .where(eq(findings.analysisId, analysis.id));
      expect(storedFindings).toHaveLength(result.findings.length);
      expect(new Set(storedFindings.map((f) => f.fingerprint)).size).toBe(result.findings.length);
      const nodes = await db
        .select()
        .from(moduleNodes)
        .where(eq(moduleNodes.analysisId, analysis.id));
      const edges = await db
        .select()
        .from(moduleEdges)
        .where(eq(moduleEdges.analysisId, analysis.id));
      expect(nodes.filter((n) => n.kind === "file")).toHaveLength(
        result.graph?.fileNodes.length ?? -1,
      );
      expect(nodes.find((n) => n.path === "src/core/a.ts")?.inCycle).toBe(true);
      expect(edges.some((e) => e.kind === "file" && e.inCycle)).toBe(true);
      // Findings are attributed to file and directory nodes.
      expect(nodes.find((n) => n.path === "src/services/orders.ts")?.findingCount).toBeGreaterThan(
        0,
      );
      expect(
        nodes.find((n) => n.path === "src/services" && n.kind === "dir")?.findingCount,
      ).toBeGreaterThan(0);

      // Idempotent: persisting again replaces rather than duplicates.
      await persistResult(db, {
        analysisId: analysis.id,
        result,
        commitSha: "c".repeat(40),
        commitDate: new Date(),
        branch: "main",
        startedAt: new Date(),
      });
      const again = await db.select().from(findings).where(eq(findings.analysisId, analysis.id));
      expect(again).toHaveLength(result.findings.length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("runAnalysis", () => {
  it("marks the analysis failed with a readable reason when the repository does not exist", async () => {
    const { analysis } = await seedRepo(
      "https://github.com/repolens-does-not-exist-xyz/nothing-here.git",
    );
    await runAnalysis(
      { db, cipher: null, workdir, logger: noopLogger, network: false, timeoutMs: 60_000 },
      analysis.id,
    );
    const [row] = await db.select().from(analyses).where(eq(analyses.id, analysis.id));
    expect(row?.status).toBe("failed");
    expect(row?.error).toMatch(/not found|refused|git failed|timed out/i);
    const steps = await db
      .select()
      .from(analysisSteps)
      .where(eq(analysisSteps.analysisId, analysis.id));
    expect(steps.find((s) => s.key === "clone")?.status).toBe("failed");
    expect(steps.filter((s) => s.status === "skipped")).toHaveLength(steps.length - 1);
  });

  it("skips analyses that are already finished", async () => {
    const { analysis } = await seedRepo("https://github.com/acme/widgets.git");
    await db.update(analyses).set({ status: "cancelled" }).where(eq(analyses.id, analysis.id));
    await runAnalysis(
      { db, cipher: null, workdir, logger: noopLogger, network: false },
      analysis.id,
    );
    const [row] = await db.select().from(analyses).where(eq(analyses.id, analysis.id));
    expect(row?.status).toBe("cancelled");
  });

  it("git is available for the worker", () => {
    expect(execFileSync("git", ["--version"]).toString()).toMatch(/git version/);
  });
});
