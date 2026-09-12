import { CreateRepositoryBodySchema } from "@repolens/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { parse } from "../lib/validate";
import { listAnalyses, startAnalysis } from "../services/analyses";
import { requireViewer } from "../services/auth";
import {
  addRepository,
  assertCanManage,
  deleteRepository,
  findReadableRepository,
  listGitHubRepos,
  listOwnRepositories,
  repositoryDetail,
} from "../services/repositories";

const RepoParams = z.object({
  owner: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[\w.-]+$/),
  name: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[\w.-]+$/),
});
const GitHubReposQuery = z.object({
  q: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).max(50).default(1),
});
const ListQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) });

export const repositoriesRoutes: FastifyPluginAsync = async (app) => {
  const { ctx } = app;

  app.get("/github/repos", async (req) => {
    const viewer = requireViewer(req.viewer);
    const q = parse(GitHubReposQuery, req.query);
    return listGitHubRepos(ctx, viewer, q.page, q.q);
  });

  app.get("/repositories", async (req) => {
    const viewer = requireViewer(req.viewer);
    return { repositories: await listOwnRepositories(ctx, viewer) };
  });

  app.post("/repositories", async (req, reply) => {
    const viewer = requireViewer(req.viewer);
    const body = parse(CreateRepositoryBodySchema, req.body);
    const repo = await addRepository(ctx, viewer, body.owner, body.name);
    reply.status(201);
    return repositoryDetail(ctx, viewer, repo);
  });

  app.get("/repositories/:owner/:name", async (req) => {
    const p = parse(RepoParams, req.params);
    const repo = await findReadableRepository(ctx, req.viewer, p.owner, p.name);
    return repositoryDetail(ctx, req.viewer, repo);
  });

  app.delete("/repositories/:owner/:name", async (req) => {
    const p = parse(RepoParams, req.params);
    const repo = await findReadableRepository(ctx, req.viewer, p.owner, p.name);
    assertCanManage(repo, req.viewer);
    await deleteRepository(ctx, repo);
    return { ok: true };
  });

  app.get("/repositories/:owner/:name/analyses", async (req) => {
    const p = parse(RepoParams, req.params);
    const q = parse(ListQuery, req.query);
    const repo = await findReadableRepository(ctx, req.viewer, p.owner, p.name);
    return { analyses: await listAnalyses(ctx, repo, q.limit) };
  });

  app.post("/repositories/:owner/:name/analyses", async (req, reply) => {
    const p = parse(RepoParams, req.params);
    const repo = await findReadableRepository(ctx, req.viewer, p.owner, p.name);
    const viewer = assertCanManage(repo, req.viewer);
    const { analysis, created } = await startAnalysis(ctx, viewer, repo);
    reply.status(created ? 202 : 200);
    return { analysis, created };
  });
};
