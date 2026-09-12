import { moduleEdges, moduleNodes } from "@repolens/database";
import { type ArchitectureQuery, type ArchitectureResponse, LIMITS } from "@repolens/shared";
import { and, eq } from "drizzle-orm";
import type { AppContext, Viewer } from "../context";
import { loadAnalysis } from "./analyses";

export async function architectureOf(
  ctx: AppContext,
  viewer: Viewer | null,
  analysisId: string,
  q: ArchitectureQuery,
): Promise<ArchitectureResponse> {
  const { analysis } = await loadAnalysis(ctx, viewer, analysisId);
  const level = q.level;
  const root = level === "file" ? (q.root ?? null) : null;

  const nodeWhere = root
    ? and(
        eq(moduleNodes.analysisId, analysisId),
        eq(moduleNodes.kind, "file"),
        eq(moduleNodes.parentPath, root),
      )
    : and(eq(moduleNodes.analysisId, analysisId), eq(moduleNodes.kind, level));
  const [nodeRows, edgeRows] = await Promise.all([
    ctx.db.select().from(moduleNodes).where(nodeWhere),
    ctx.db
      .select()
      .from(moduleEdges)
      .where(and(eq(moduleEdges.analysisId, analysisId), eq(moduleEdges.kind, level))),
  ]);

  // Largest modules first so truncation keeps the interesting part of big repositories.
  const sorted = nodeRows.sort((a, b) => b.loc - a.loc || a.path.localeCompare(b.path));
  const truncated = sorted.length > LIMITS.maxGraphNodes;
  const kept = truncated ? sorted.slice(0, LIMITS.maxGraphNodes) : sorted;
  const keptPaths = new Set(kept.map((n) => n.path));
  const edges = edgeRows.filter((e) => keptPaths.has(e.fromPath) && keptPaths.has(e.toPath));

  const cycles = (analysis.metrics?.architecture?.cycles ?? []).filter(
    (c) => level === "dir" || c.paths.some((p) => keptPaths.has(p)),
  );
  return {
    level,
    root,
    nodes: kept
      .map((n) => ({
        path: n.path,
        kind: n.kind,
        loc: n.loc,
        fileCount: n.fileCount,
        fanIn: n.fanIn,
        fanOut: n.fanOut,
        instability: n.instability,
        findingCount: n.findingCount,
        inCycle: n.inCycle,
      }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    edges: edges.map((e) => ({
      from: e.fromPath,
      to: e.toPath,
      weight: e.weight,
      inCycle: e.inCycle,
    })),
    cycles: level === "dir" ? cycles.slice(0, 50) : cycles,
    truncated,
  };
}
