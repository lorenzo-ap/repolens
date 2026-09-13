import { createDatabase, TokenCipher } from "@repolens/database";
import { ANALYSIS_QUEUE, LIMITS } from "@repolens/shared";
import { PgBoss } from "pg-boss";
import pino from "pino";
import { buildApp } from "./app";
import { loadConfig } from "./config";
import type { AppContext, Queue } from "./context";
import { triggerAnalyzer } from "./lib/analyzer-trigger";
import { createGitHubClient } from "./lib/github";
import { closeErrorReporting, initErrorReporting } from "./lib/sentry";
import { purgeExpiredSessions } from "./services/auth";

const config = loadConfig();
const logger = pino({
  level: config.logLevel,
  ...(config.nodeEnv === "development"
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
});

const version = process.env.npm_package_version ?? "0.1.0";
// Must happen before anything else can throw. Without SENTRY_DSN this is a no-op.
if (initErrorReporting({ dsn: config.sentryDsn, environment: config.nodeEnv, release: version })) {
  logger.info("error reporting enabled");
}

const database = createDatabase(config.databaseUrl, { max: 10 });
const boss = new PgBoss({ connectionString: config.databaseUrl, schema: "pgboss", max: 2 });
boss.on("error", (err) => logger.error({ err }, "pg-boss error"));
await boss.start();
await boss.createQueue(ANALYSIS_QUEUE, {
  retryLimit: 1,
  retryDelay: 30,
  expireInSeconds: Math.ceil((LIMITS.analysisTimeoutMs + 120_000) / 1000),
});

const queue: Queue = {
  async enqueue(payload) {
    const id = await boss.send(ANALYSIS_QUEUE, payload, { singletonKey: payload.analysisId });
    if (!id) throw new Error("queue rejected the job");
    // Best effort, and deliberately not awaited: the job is durable in PostgreSQL either way.
    void triggerAnalyzer(config.analyzerUrl, logger);
  },
  async ping() {
    try {
      await boss.getQueue(ANALYSIS_QUEUE);
      return true;
    } catch {
      return false;
    }
  },
};

const ctx: AppContext = {
  db: database.db,
  dbPing: database.ping,
  queue,
  github: config.github ? createGitHubClient(config.github) : null,
  cipher: new TokenCipher(config.tokenEncryptionKey),
  config,
  logger,
  version,
};
if (!ctx.github)
  logger.warn("GITHUB_CLIENT_ID/SECRET not set: sign-in is disabled, demo mode only");

const app = await buildApp(ctx);
await app.listen({ port: config.port, host: config.host });
await purgeExpiredSessions(ctx).catch((err) => logger.warn({ err }, "session purge failed"));
const purgeTimer = setInterval(
  () => void purgeExpiredSessions(ctx).catch((err) => logger.warn({ err }, "session purge failed")),
  60 * 60 * 1000,
);
purgeTimer.unref();

const shutdown = async (signal: string) => {
  logger.info({ signal }, "shutting down");
  await app.close();
  await boss.stop({ graceful: false });
  await database.close();
  // Give queued events a moment to reach Sentry; returns immediately when reporting is off.
  await closeErrorReporting();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
