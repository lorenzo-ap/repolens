import { createDatabase, TokenCipher } from "@repolens/database";
import { ANALYSIS_QUEUE, type AnalysisJobPayload, LIMITS } from "@repolens/shared";
import { PgBoss } from "pg-boss";
import pino from "pino";
import { loadConfig } from "./config";
import { runAnalysis } from "./run-analysis";

const config = loadConfig();
const logger = pino({
  level: config.logLevel,
  ...(config.nodeEnv === "development"
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
});

const database = createDatabase(config.databaseUrl, { max: 4 });
const cipher = config.tokenEncryptionKey ? new TokenCipher(config.tokenEncryptionKey) : null;
if (!cipher) logger.warn("TOKEN_ENCRYPTION_KEY not set: private repositories cannot be cloned");

const boss = new PgBoss({ connectionString: config.databaseUrl, schema: "pgboss", max: 2 });
boss.on("error", (err) => logger.error({ err }, "pg-boss error"));

await boss.start();
await boss.createQueue(ANALYSIS_QUEUE, {
  retryLimit: 1,
  retryDelay: 30,
  expireInSeconds: Math.ceil((LIMITS.analysisTimeoutMs + 120_000) / 1000),
  retentionSeconds: 60 * 60 * 24 * 7,
});

await boss.work<AnalysisJobPayload>(
  ANALYSIS_QUEUE,
  { batchSize: 1, pollingIntervalSeconds: 2 },
  async (jobs) => {
    for (const job of jobs) {
      const child = logger.child({ analysisId: job.data.analysisId, jobId: job.id });
      child.info("job received");
      await runAnalysis(
        {
          db: database.db,
          cipher,
          workdir: config.workdir,
          logger: child,
          network: config.network,
        },
        job.data.analysisId,
      );
    }
  },
);
logger.info({ queue: ANALYSIS_QUEUE, workdir: config.workdir }, "analyzer worker started");

const shutdown = async (signal: string) => {
  logger.info({ signal }, "shutting down");
  await boss.stop({ graceful: true, timeout: 30_000 });
  await database.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
