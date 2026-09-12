import { analyses, findings, repositories } from "@repolens/database";
import type { DemoResponse } from "@repolens/shared";
import { and, asc, desc, eq } from "drizzle-orm";
import type { AppContext } from "../context";
import { NotFoundError } from "../lib/errors";
import { serializeAnalysis, serializeFinding, serializeRepository } from "../serializers";
import { analysisSummaryColumns } from "./repositories";

export async function demoOverview(ctx: AppContext): Promise<DemoResponse> {
  const [repo] = await ctx.db
    .select()
    .from(repositories)
    .where(eq(repositories.isDemo, true))
    .orderBy(asc(repositories.createdAt))
    .limit(1);
  if (!repo) throw new NotFoundError("Demo repository");
  const [latest] = await ctx.db
    .select(analysisSummaryColumns)
    .from(analyses)
    .where(and(eq(analyses.repositoryId, repo.id), eq(analyses.status, "completed")))
    .orderBy(desc(analyses.createdAt))
    .limit(1);
  const top = latest
    ? await ctx.db
        .select()
        .from(findings)
        .where(eq(findings.analysisId, latest.id))
        .orderBy(asc(findings.severityRank), asc(findings.id))
        .limit(5)
    : [];
  return {
    repository: serializeRepository(repo, null),
    latestAnalysis: latest ? serializeAnalysis(latest) : null,
    topFindings: top.map(serializeFinding),
  };
}
