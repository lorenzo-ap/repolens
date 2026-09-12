import { ArchitectureQuerySchema, FindingsQuerySchema } from "@repolens/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { parse } from "../lib/validate";
import {
  analysisDetail,
  cancelAnalysis,
  compareAnalyses,
  historyOf,
  loadAnalysis,
  metricsOf,
} from "../services/analyses";
import { architectureOf } from "../services/architecture";
import { createIssueFromFinding, findingDetail, queryFindings } from "../services/findings";
import { assertCanManage } from "../services/repositories";

const Id = z.string().min(1).max(64);
const IdParams = z.object({ id: Id });
const FindingParams = z.object({ id: Id, findingId: Id });
const CompareParams = z.object({ id: Id, otherId: Id });

export const analysesRoutes: FastifyPluginAsync = async (app) => {
  const { ctx } = app;

  const cacheDemo = (isDemo: boolean, reply: { header: (k: string, v: string) => unknown }) => {
    if (isDemo) reply.header("cache-control", "public, max-age=300");
  };

  app.get("/analyses/:id", async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const detail = await analysisDetail(ctx, req.viewer, id);
    if (detail.analysis.status === "completed") cacheDemo(detail.repository.isDemo, reply);
    return detail;
  });

  app.post("/analyses/:id/cancel", async (req) => {
    const { id } = parse(IdParams, req.params);
    const { analysis, repository } = await loadAnalysis(ctx, req.viewer, id);
    assertCanManage(repository, req.viewer);
    await cancelAnalysis(ctx, analysis);
    return { ok: true };
  });

  app.get("/analyses/:id/metrics", async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const { repository } = await loadAnalysis(ctx, req.viewer, id);
    cacheDemo(repository.isDemo, reply);
    return metricsOf(ctx, req.viewer, id);
  });

  app.get("/analyses/:id/history", async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const { repository } = await loadAnalysis(ctx, req.viewer, id);
    cacheDemo(repository.isDemo, reply);
    return historyOf(ctx, req.viewer, id);
  });

  app.get("/analyses/:id/findings", async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const q = parse(FindingsQuerySchema, req.query);
    const { repository } = await loadAnalysis(ctx, req.viewer, id);
    cacheDemo(repository.isDemo, reply);
    return queryFindings(ctx, req.viewer, id, q);
  });

  app.get("/analyses/:id/findings/:findingId", async (req, reply) => {
    const p = parse(FindingParams, req.params);
    const { repository } = await loadAnalysis(ctx, req.viewer, p.id);
    cacheDemo(repository.isDemo, reply);
    return findingDetail(ctx, req.viewer, p.id, p.findingId);
  });

  app.post("/analyses/:id/findings/:findingId/issue", async (req, reply) => {
    const p = parse(FindingParams, req.params);
    const result = await createIssueFromFinding(ctx, req.viewer, p.id, p.findingId);
    reply.status(201);
    return result;
  });

  app.get("/analyses/:id/architecture", async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const q = parse(ArchitectureQuerySchema, req.query);
    const { repository } = await loadAnalysis(ctx, req.viewer, id);
    cacheDemo(repository.isDemo, reply);
    return architectureOf(ctx, req.viewer, id, q);
  });

  app.get("/analyses/:id/compare/:otherId", async (req, reply) => {
    const p = parse(CompareParams, req.params);
    const { repository } = await loadAnalysis(ctx, req.viewer, p.id);
    cacheDemo(repository.isDemo, reply);
    return compareAnalyses(ctx, req.viewer, p.otherId, p.id);
  });
};
