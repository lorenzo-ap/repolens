import { type FindingRow, findings } from "@repolens/database";
import type {
  CreateIssueResponse,
  FindingDetail,
  FindingsPage,
  FindingsQuery,
} from "@repolens/shared";
import { and, asc, desc, eq, gt, ilike, inArray, like, ne, or, type SQL, sql } from "drizzle-orm";
import type { AppContext, Viewer } from "../context";
import { ConflictError, ForbiddenError, NotFoundError } from "../lib/errors";
import { serializeFinding } from "../serializers";
import { loadAnalysis } from "./analyses";
import { assertCanManage } from "./repositories";

interface Cursor {
  sortValue: string | number;
  id: string;
}

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Cursor;
    if (typeof parsed.id !== "string") return null;
    if (typeof parsed.sortValue !== "string" && typeof parsed.sortValue !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function queryFindings(
  ctx: AppContext,
  viewer: Viewer | null,
  analysisId: string,
  q: FindingsQuery,
): Promise<FindingsPage> {
  await loadAnalysis(ctx, viewer, analysisId);
  const filters: SQL[] = [eq(findings.analysisId, analysisId)];
  if (q.severity?.length) filters.push(inArray(findings.severity, q.severity));
  if (q.category?.length) filters.push(inArray(findings.category, q.category));
  if (q.ruleId) filters.push(eq(findings.ruleId, q.ruleId));
  if (q.path) filters.push(like(findings.filePath, `${escapeLike(q.path)}%`));
  if (q.q) {
    const term = `%${escapeLike(q.q)}%`;
    filters.push(
      or(
        ilike(findings.title, term),
        ilike(findings.message, term),
        ilike(findings.filePath, term),
        ilike(findings.ruleId, term),
      ) as SQL,
    );
  }
  const where = and(...filters);

  const cursor = decodeCursor(q.cursor);
  const sortColumn =
    q.sort === "file"
      ? findings.filePath
      : q.sort === "rule"
        ? findings.ruleId
        : findings.severityRank;
  let pageWhere = where;
  if (cursor) {
    // Keyset: rows strictly after (sortValue, id). Nulls in filePath sort last in asc order.
    const sortVal = cursor.sortValue;
    const after =
      q.sort === "severity"
        ? or(
            gt(findings.severityRank, Number(sortVal)),
            and(eq(findings.severityRank, Number(sortVal)), gt(findings.id, cursor.id)),
          )
        : or(
            gt(sortColumn, String(sortVal)),
            and(eq(sortColumn, String(sortVal)), gt(findings.id, cursor.id)),
          );
    pageWhere = and(where, after as SQL);
  }

  const [rows, totals, rules] = await Promise.all([
    ctx.db
      .select()
      .from(findings)
      .where(pageWhere)
      .orderBy(asc(sortColumn), asc(findings.id))
      .limit(q.limit + 1),
    ctx.db.select({ total: sql<number>`count(*)::int` }).from(findings).where(where),
    ctx.db
      .select({ ruleId: findings.ruleId, count: sql<number>`count(*)::int` })
      .from(findings)
      .where(eq(findings.analysisId, analysisId))
      .groupBy(findings.ruleId)
      .orderBy(desc(sql`count(*)`), asc(findings.ruleId)),
  ]);
  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({
          sortValue:
            q.sort === "severity"
              ? last.severityRank
              : q.sort === "file"
                ? (last.filePath ?? "")
                : last.ruleId,
          id: last.id,
        })
      : null;
  return { findings: page.map(serializeFinding), nextCursor, total: totals[0]?.total ?? 0, rules };
}

export async function findingDetail(
  ctx: AppContext,
  viewer: Viewer | null,
  analysisId: string,
  findingId: string,
): Promise<FindingDetail> {
  const { analysis, repository } = await loadAnalysis(ctx, viewer, analysisId);
  const [row] = await ctx.db
    .select()
    .from(findings)
    .where(and(eq(findings.id, findingId), eq(findings.analysisId, analysisId)))
    .limit(1);
  if (!row) throw new NotFoundError("Finding");
  const related = row.filePath
    ? await ctx.db
        .select()
        .from(findings)
        .where(
          and(
            eq(findings.analysisId, analysisId),
            eq(findings.filePath, row.filePath),
            ne(findings.id, row.id),
          ),
        )
        .orderBy(asc(findings.severityRank), asc(findings.line))
        .limit(20)
    : [];
  const githubFileUrl =
    row.filePath && analysis.commitSha
      ? `${repository.htmlUrl}/blob/${analysis.commitSha}/${row.filePath.split("/").map(encodeURIComponent).join("/")}${row.line ? `#L${row.line}${row.endLine && row.endLine > row.line ? `-L${row.endLine}` : ""}` : ""}`
      : null;
  return { finding: serializeFinding(row), related: related.map(serializeFinding), githubFileUrl };
}

export function issueBodyFor(
  f: FindingRow,
  repoHtmlUrl: string,
  commitSha: string | null,
  analysisUrl: string,
): string {
  const location = f.filePath
    ? `**Location:** [\`${f.filePath}${f.line ? `:${f.line}` : ""}\`](${repoHtmlUrl}/blob/${commitSha ?? "HEAD"}/${f.filePath}${f.line ? `#L${f.line}` : ""})`
    : "";
  const evidence = f.evidence.snippet
    ? `\n\n**Evidence**\n\n\`\`\`\n${f.evidence.snippet}\n\`\`\``
    : "";
  const data = f.evidence.data
    ? `\n\n${Object.entries(f.evidence.data)
        .map(([k, v]) => `- ${k}: ${String(v)}`)
        .join("\n")}`
    : "";
  const related = f.evidence.relatedPaths?.length
    ? `\n\n**Related files**\n\n${f.evidence.relatedPaths.map((p) => `- \`${p}\``).join("\n")}`
    : "";
  return `${f.message}\n\n${location}${evidence}${data}${related}\n\n**Recommendation**\n\n${f.recommendation}\n\n---\n_Reported by [RepoLens](${analysisUrl}) · rule \`${f.ruleId}\` · severity **${f.severity}**${commitSha ? ` · commit \`${commitSha.slice(0, 7)}\`` : ""}_`;
}

export async function createIssueFromFinding(
  ctx: AppContext,
  viewer: Viewer | null,
  analysisId: string,
  findingId: string,
): Promise<CreateIssueResponse> {
  const { analysis, repository } = await loadAnalysis(ctx, viewer, analysisId);
  const manager = assertCanManage(repository, viewer);
  if (!ctx.github) throw new ForbiddenError("GitHub integration is not configured");
  const [row] = await ctx.db
    .select()
    .from(findings)
    .where(and(eq(findings.id, findingId), eq(findings.analysisId, analysisId)))
    .limit(1);
  if (!row) throw new NotFoundError("Finding");
  if (row.githubIssueUrl)
    throw new ConflictError("An issue already exists for this finding", {
      url: row.githubIssueUrl,
    });
  const analysisUrl = `${ctx.config.webOrigin}/r/${repository.owner}/${repository.name}/findings?analysis=${analysis.id}&finding=${row.id}`;
  const issue = await ctx.github.createIssue(
    manager.githubToken(),
    repository.owner,
    repository.name,
    {
      title: `[RepoLens] ${row.title}`,
      body: issueBodyFor(row, repository.htmlUrl, analysis.commitSha, analysisUrl),
      labels: ["repolens", `severity:${row.severity}`],
    },
  );
  await ctx.db
    .update(findings)
    .set({ githubIssueUrl: issue.html_url })
    .where(eq(findings.id, row.id));
  ctx.logger.info({ findingId: row.id, issue: issue.number }, "issue created");
  return { url: issue.html_url, number: issue.number };
}
