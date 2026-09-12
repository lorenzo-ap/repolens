import {
  type ArchitectureGraph,
  categoryScoresOf,
  fingerprintOf,
  type PipelineResult,
} from "@repolens/analysis";
import {
  analyses,
  analysisSteps,
  type Database,
  findings as findingsTable,
  moduleEdges,
  moduleNodes,
  type NewFindingRow,
  type NewModuleEdgeRow,
  type NewModuleNodeRow,
} from "@repolens/database";
import {
  type AnalysisStatus,
  CATEGORIES,
  type FindingSummary,
  gradeForScore,
  SEVERITIES,
  SEVERITY_RANK,
  type StepKey,
  type StepStatus,
} from "@repolens/shared";
import { and, eq } from "drizzle-orm";

const BATCH = 500;

export interface StepPatch {
  status: StepStatus;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  durationMs?: number | null;
  detail?: string | null;
  error?: string | null;
}

export async function updateStep(
  db: Database,
  analysisId: string,
  key: StepKey,
  patch: StepPatch,
): Promise<void> {
  await db
    .update(analysisSteps)
    .set(patch)
    .where(and(eq(analysisSteps.analysisId, analysisId), eq(analysisSteps.key, key)));
}

export async function setAnalysisStatus(
  db: Database,
  analysisId: string,
  status: AnalysisStatus,
  extra: Partial<typeof analyses.$inferInsert> = {},
): Promise<void> {
  await db
    .update(analyses)
    .set({ status, updatedAt: new Date(), ...extra })
    .where(eq(analyses.id, analysisId));
}

export function summarizeFindings(
  rows: Array<{ severity: string; category: string }>,
): FindingSummary {
  const bySeverity = Object.fromEntries(
    SEVERITIES.map((s) => [s, 0]),
  ) as FindingSummary["bySeverity"];
  const byCategory = Object.fromEntries(
    CATEGORIES.map((c) => [c, 0]),
  ) as FindingSummary["byCategory"];
  for (const r of rows) {
    bySeverity[r.severity as keyof typeof bySeverity] =
      (bySeverity[r.severity as keyof typeof bySeverity] ?? 0) + 1;
    byCategory[r.category as keyof typeof byCategory] =
      (byCategory[r.category as keyof typeof byCategory] ?? 0) + 1;
  }
  return { bySeverity, byCategory, total: rows.length };
}

function graphRows(
  analysisId: string,
  graph: ArchitectureGraph,
  findingCountByFile: Map<string, number>,
) {
  const dirCounts = new Map<string, number>();
  for (const f of graph.fileNodes) {
    const c = findingCountByFile.get(f.path) ?? 0;
    if (f.parentPath) dirCounts.set(f.parentPath, (dirCounts.get(f.parentPath) ?? 0) + c);
  }
  const nodes: NewModuleNodeRow[] = [
    ...graph.fileNodes.map((n) => ({
      analysisId,
      path: n.path,
      kind: "file" as const,
      parentPath: n.parentPath,
      loc: n.loc,
      fileCount: 1,
      fanIn: n.fanIn,
      fanOut: n.fanOut,
      instability: n.instability,
      findingCount: findingCountByFile.get(n.path) ?? 0,
      inCycle: n.inCycle,
    })),
    ...graph.dirNodes.map((n) => ({
      analysisId,
      path: n.path,
      kind: "dir" as const,
      parentPath: n.parentPath,
      loc: n.loc,
      fileCount: n.fileCount,
      fanIn: n.fanIn,
      fanOut: n.fanOut,
      instability: n.instability,
      findingCount: dirCounts.get(n.path) ?? 0,
      inCycle: n.inCycle,
    })),
  ];
  const edges: NewModuleEdgeRow[] = [...graph.fileEdges, ...graph.dirEdges].map((e) => ({
    analysisId,
    kind: e.kind,
    fromPath: e.from,
    toPath: e.to,
    weight: e.weight,
    inCycle: e.inCycle,
  }));
  return { nodes, edges };
}

export interface PersistInput {
  analysisId: string;
  result: PipelineResult;
  commitSha: string;
  commitDate: Date;
  branch: string | null;
  startedAt: Date;
}

/** Writes findings, the module graph and the final analysis row in one transaction. */
export async function persistResult(db: Database, input: PersistInput): Promise<void> {
  const { analysisId, result } = input;
  const scoring = result.metrics.scoring;
  if (!scoring) throw new Error("pipeline result has no scoring");

  const findingRows: NewFindingRow[] = result.findings.map((f) => ({
    analysisId,
    ruleId: f.ruleId,
    category: f.category,
    severity: f.severity,
    severityRank: SEVERITY_RANK[f.severity],
    title: f.title,
    message: f.message,
    filePath: f.filePath,
    line: f.line,
    endLine: f.endLine,
    symbol: f.symbol,
    evidence: f.evidence,
    recommendation: f.recommendation,
    fingerprint: fingerprintOf(f),
  }));
  const findingCountByFile = new Map<string, number>();
  for (const f of result.findings)
    if (f.filePath)
      findingCountByFile.set(f.filePath, (findingCountByFile.get(f.filePath) ?? 0) + 1);
  const graph = result.graph
    ? graphRows(analysisId, result.graph, findingCountByFile)
    : { nodes: [], edges: [] };
  const finishedAt = new Date();

  await db.transaction(async (tx) => {
    // Idempotent on retry: clear anything a previous attempt may have written.
    await tx.delete(findingsTable).where(eq(findingsTable.analysisId, analysisId));
    await tx.delete(moduleNodes).where(eq(moduleNodes.analysisId, analysisId));
    await tx.delete(moduleEdges).where(eq(moduleEdges.analysisId, analysisId));
    for (let i = 0; i < findingRows.length; i += BATCH)
      await tx.insert(findingsTable).values(findingRows.slice(i, i + BATCH));
    for (let i = 0; i < graph.nodes.length; i += BATCH)
      await tx.insert(moduleNodes).values(graph.nodes.slice(i, i + BATCH));
    for (let i = 0; i < graph.edges.length; i += BATCH)
      await tx.insert(moduleEdges).values(graph.edges.slice(i, i + BATCH));
    await tx
      .update(analyses)
      .set({
        status: "completed",
        commitSha: input.commitSha,
        commitDate: input.commitDate,
        branch: input.branch,
        finishedAt,
        durationMs: finishedAt.getTime() - input.startedAt.getTime(),
        healthScore: scoring.healthScore,
        grade: gradeForScore(scoring.healthScore),
        categoryScores: categoryScoresOf(scoring),
        findingSummary: summarizeFindings(findingRows),
        metrics: result.metrics,
        error: null,
        updatedAt: finishedAt,
      })
      .where(eq(analyses.id, analysisId));
  });
}
