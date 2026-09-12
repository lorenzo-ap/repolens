import type { HealthResponse } from "@repolens/shared";
import type { FastifyPluginAsync } from "fastify";
import { demoOverview } from "../services/demo";

export const miscRoutes: FastifyPluginAsync = async (app) => {
  const { ctx } = app;

  app.get("/health", async (_req, reply) => {
    const [database, queue] = await Promise.all([ctx.dbPing(), ctx.queue.ping()]);
    const body: HealthResponse = {
      status: database && queue ? "ok" : "degraded",
      database,
      queue,
      version: ctx.version,
    };
    reply.status(body.status === "ok" ? 200 : 503);
    return body;
  });

  app.get("/demo", async (_req, reply) => {
    reply.header("cache-control", "public, max-age=120");
    return demoOverview(ctx);
  });
};
