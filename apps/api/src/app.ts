import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { ApiError } from "@repolens/shared";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppContext } from "./context";
import { AppError } from "./lib/errors";
import { reportError } from "./lib/sentry";
import { analysesRoutes } from "./routes/analyses";
import { authRoutes } from "./routes/auth";
import { miscRoutes } from "./routes/misc";
import { repositoriesRoutes } from "./routes/repositories";
import { resolveViewer } from "./services/auth";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: ctx.logger,
    trustProxy: ctx.config.trustProxy,
    disableRequestLogging: ctx.config.nodeEnv === "test",
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 64 * 1024,
  });
  app.decorate("ctx", ctx);
  app.decorateRequest("viewer", null);

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
  });
  await app.register(cors, {
    origin: [ctx.config.webOrigin],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    allowList: (req) => req.url === "/api/v1/health",
    keyGenerator: (req) => req.viewer?.user.id ?? req.ip,
    errorResponseBuilder: (_req, context) => ({
      error: {
        code: "rate_limited",
        message: `Too many requests; retry in ${Math.ceil(context.ttl / 1000)}s`,
      },
    }),
  });

  app.addHook("onRequest", async (req, reply) => {
    reply.header("x-request-id", req.id);
    reply.header("cache-control", "private, no-store");
    const token = req.cookies[ctx.config.sessionCookieName];
    req.viewer = await resolveViewer(ctx, token);
  });

  // CSRF: state-changing requests must originate from the web app (or the API itself for
  // same-origin form posts). Cookies are SameSite=Lax, so this is a second line of defence.
  app.addHook("preHandler", async (req) => {
    if (!MUTATING.has(req.method)) return;
    const origin =
      req.headers.origin ?? (req.headers.referer ? new URL(req.headers.referer).origin : undefined);
    if (!origin) throw new AppError("forbidden", 403, "Missing Origin header");
    if (origin !== ctx.config.webOrigin && origin !== ctx.config.apiOrigin) {
      throw new AppError("forbidden", 403, "Cross-site request rejected");
    }
  });

  app.setNotFoundHandler((req, reply) => {
    const body: ApiError = {
      error: {
        code: "not_found",
        message: `Route ${req.method} ${req.url} not found`,
        requestId: req.id,
      },
    };
    reply.status(404).send(body);
  });

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof AppError) {
      if (err.statusCode >= 500) {
        req.log.error({ err }, err.message);
        reportError(err, { requestId: req.id, method: req.method, url: req.url });
      }
      const body: ApiError = {
        error: { code: err.code, message: err.message, requestId: req.id, details: err.details },
      };
      reply.status(err.statusCode).send(body);
      return;
    }
    const fastifyErr = err as {
      statusCode?: number;
      code?: string;
      message?: string;
      validation?: unknown;
    };
    if (fastifyErr.statusCode === 429) {
      reply.status(429).send({
        error: {
          code: "rate_limited",
          message: fastifyErr.message ?? "Too many requests",
          requestId: req.id,
        },
      });
      return;
    }
    if (fastifyErr.statusCode && fastifyErr.statusCode >= 400 && fastifyErr.statusCode < 500) {
      reply.status(fastifyErr.statusCode).send({
        error: {
          code: "validation_failed",
          message: fastifyErr.message ?? "Bad request",
          requestId: req.id,
        },
      });
      return;
    }
    req.log.error({ err }, "unhandled error");
    reportError(err, { requestId: req.id, method: req.method, url: req.url });
    const body: ApiError = {
      error: { code: "internal", message: "Something went wrong on our side", requestId: req.id },
    };
    reply.status(500).send(body);
  });

  await app.register(
    async (api) => {
      await api.register(miscRoutes);
      await api.register(authRoutes);
      await api.register(repositoriesRoutes);
      await api.register(analysesRoutes);
    },
    { prefix: "/api/v1" },
  );

  return app;
}
