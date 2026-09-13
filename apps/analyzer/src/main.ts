import { ANALYSIS_QUEUE } from "@repolens/shared";
import pino from "pino";
import { loadConfig } from "./config";
import { startWorker } from "./worker";

/** Long-running worker: polls the queue forever. See drain.ts for the run-to-completion variant. */

const config = loadConfig();
const logger = pino({
  level: config.logLevel,
  ...(config.nodeEnv === "development"
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
});

const worker = startWorker(config, logger);
await worker.started;
logger.info({ queue: ANALYSIS_QUEUE, workdir: config.workdir }, "analyzer worker started");

const shutdown = async (signal: string) => {
  logger.info({ signal }, "shutting down");
  await worker.stop();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
