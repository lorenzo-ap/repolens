import { analyses, type RepositoryRow, repositories } from "@repolens/database";
import {
  type GitHubRepo,
  type GitHubReposResponse,
  LIMITS,
  type RepositoryDetail,
} from "@repolens/shared";
import { and, count, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { AppContext, Viewer } from "../context";
import { ForbiddenError, NotFoundError } from "../lib/errors";
import { serializeAnalysis, serializeRepository } from "../serializers";

/**
 * Finds a repository the viewer may read: their own, or a public demo one. Returns 404 for
 * everything else so private repository names are never confirmed to strangers.
 */
export async function findReadableRepository(
  ctx: AppContext,
  viewer: Viewer | null,
  owner: string,
  name: string,
): Promise<RepositoryRow> {
  const fullName = `${owner}/${name}`;
  const visibility = viewer
    ? or(eq(repositories.isDemo, true), eq(repositories.ownerUserId, viewer.user.id))
    : eq(repositories.isDemo, true);
  const rows = await ctx.db
    .select()
    .from(repositories)
    .where(and(eq(repositories.fullName, fullName), visibility))
    .limit(2);
  // Prefer the viewer's own copy when both a demo and a personal copy exist.
  const own = rows.find((r) => viewer && r.ownerUserId === viewer.user.id);
  const repo = own ?? rows[0];
  if (!repo) throw new NotFoundError("Repository");
  return repo;
}

export async function findReadableRepositoryById(
  ctx: AppContext,
  viewer: Viewer | null,
  id: string,
): Promise<RepositoryRow> {
  const [repo] = await ctx.db.select().from(repositories).where(eq(repositories.id, id)).limit(1);
  if (!repo) throw new NotFoundError("Repository");
  if (repo.isDemo) return repo;
  if (!viewer || repo.ownerUserId !== viewer.user.id) throw new NotFoundError("Repository");
  return repo;
}

export function assertCanManage(repo: RepositoryRow, viewer: Viewer | null): Viewer {
  if (!viewer) throw new ForbiddenError("Sign in to manage this repository");
  if (repo.isDemo) throw new ForbiddenError("The demo repository is read-only");
  if (repo.ownerUserId !== viewer.user.id) throw new ForbiddenError();
  return viewer;
}

export async function latestAnalyses(ctx: AppContext, repositoryId: string) {
  const rows = await ctx.db
    .select()
    .from(analyses)
    .where(eq(analyses.repositoryId, repositoryId))
    .orderBy(desc(analyses.createdAt))
    .limit(20);
  const latestCompleted = rows.find((r) => r.status === "completed") ?? null;
  const active = rows.find((r) => r.status === "queued" || r.status === "running") ?? null;
  return { latestCompleted, active, count: rows.length };
}

export async function repositoryDetail(
  ctx: AppContext,
  viewer: Viewer | null,
  repo: RepositoryRow,
): Promise<RepositoryDetail> {
  const { latestCompleted, active } = await latestAnalyses(ctx, repo.id);
  const [counted] = await ctx.db
    .select({ count: count() })
    .from(analyses)
    .where(eq(analyses.repositoryId, repo.id));
  return {
    repository: serializeRepository(repo, viewer?.user.id ?? null),
    latestAnalysis: latestCompleted ? serializeAnalysis(latestCompleted) : null,
    activeAnalysis: active ? serializeAnalysis(active) : null,
    analysisCount: counted?.count ?? 0,
  };
}

/** Adds a GitHub repository to the viewer's workspace (idempotent) after verifying access on GitHub. */
export async function addRepository(
  ctx: AppContext,
  viewer: Viewer,
  owner: string,
  name: string,
): Promise<RepositoryRow> {
  if (!ctx.github) throw new ForbiddenError("GitHub integration is not configured");
  const gh = await ctx.github.getRepo(viewer.githubToken(), owner, name);
  if (gh.size > LIMITS.maxRepoSizeKb) {
    throw new ForbiddenError(
      `Repository is ${(gh.size / 1024).toFixed(0)} MB; the limit is ${(LIMITS.maxRepoSizeKb / 1024).toFixed(0)} MB`,
    );
  }
  const values = {
    ownerUserId: viewer.user.id,
    githubId: gh.id,
    owner: gh.owner.login,
    name: gh.name,
    fullName: gh.full_name,
    defaultBranch: gh.default_branch,
    isPrivate: gh.private,
    isDemo: false,
    sizeKb: gh.size,
    primaryLanguage: gh.language,
    description: gh.description,
    htmlUrl: gh.html_url,
    cloneUrl: gh.clone_url,
  };
  const [repo] = await ctx.db
    .insert(repositories)
    .values(values)
    .onConflictDoUpdate({
      target: [repositories.ownerUserId, repositories.fullName],
      set: { ...values, updatedAt: new Date() },
    })
    .returning();
  if (!repo) throw new Error("failed to upsert repository");
  return repo;
}

export async function deleteRepository(ctx: AppContext, repo: RepositoryRow): Promise<void> {
  await ctx.db.delete(repositories).where(eq(repositories.id, repo.id));
}

/** Lists the viewer's GitHub repositories, annotated with local analysis state. */
export async function listGitHubRepos(
  ctx: AppContext,
  viewer: Viewer,
  page: number,
  query: string | undefined,
): Promise<GitHubReposResponse> {
  if (!ctx.github) throw new ForbiddenError("GitHub integration is not configured");
  const perPage = 30;
  const { repos, hasMore } = await ctx.github.listRepos(viewer.githubToken(), {
    page,
    perPage,
    query,
    login: viewer.user.login,
  });
  const fullNames = repos.map((r) => r.full_name);
  const local = fullNames.length
    ? await ctx.db
        .select()
        .from(repositories)
        .where(
          and(
            eq(repositories.ownerUserId, viewer.user.id),
            inArray(repositories.fullName, fullNames),
          ),
        )
    : [];
  const localByName = new Map(local.map((r) => [r.fullName, r]));
  const localIds = local.map((r) => r.id);
  const recent = localIds.length
    ? await ctx.db
        .select()
        .from(analyses)
        .where(and(inArray(analyses.repositoryId, localIds), isNull(analyses.error)))
        .orderBy(desc(analyses.createdAt))
    : [];
  const byRepo = new Map<string, typeof recent>();
  for (const a of recent) {
    const list = byRepo.get(a.repositoryId) ?? [];
    list.push(a);
    byRepo.set(a.repositoryId, list);
  }
  const out: GitHubRepo[] = repos.map((r) => {
    const l = localByName.get(r.full_name);
    const list = l ? (byRepo.get(l.id) ?? []) : [];
    const latest = list.find((a) => a.status === "completed") ?? null;
    const active = list.find((a) => a.status === "queued" || a.status === "running") ?? null;
    return {
      githubId: r.id,
      owner: r.owner.login,
      name: r.name,
      fullName: r.full_name,
      description: r.description,
      isPrivate: r.private,
      defaultBranch: r.default_branch,
      primaryLanguage: r.language,
      sizeKb: r.size,
      pushedAt: r.pushed_at,
      htmlUrl: r.html_url,
      local: l
        ? {
            repositoryId: l.id,
            latestAnalysis: latest ? serializeAnalysis(latest) : null,
            activeAnalysis: active ? serializeAnalysis(active) : null,
          }
        : null,
    };
  });
  return { repos: out, page, hasMore };
}

/** Repositories the viewer has added, newest analysis first. */
export async function listOwnRepositories(ctx: AppContext, viewer: Viewer) {
  const repos = await ctx.db
    .select()
    .from(repositories)
    .where(eq(repositories.ownerUserId, viewer.user.id))
    .orderBy(desc(repositories.updatedAt));
  return Promise.all(repos.map((r) => repositoryDetail(ctx, viewer, r)));
}
