import { createServer } from "node:http";
import pino from "pino";
import { loadConfig } from "./config";
import { startWorker, waitUntilIdle } from "./worker";

/**
 * The analyzer as a scale-to-zero HTTP service.
 *
 * Cloud Run Jobs were the obvious fit for a queue that is empty most of the time, but their
 * scheduling latency was measured at two to four minutes before a container started — far longer
 * than an analysis itself takes. A service cold-starts in seconds.
 *
 * `POST /drain` holds the connection open until the queue is quiet and only then responds.
 * Callers are not expected to wait for it: the API fires the request and forgets it, and Cloud
 * Scheduler sweeps on a timer as a safety net.
 *
 * The service must run with CPU always allocated (`--no-cpu-throttling`). Cloud Run otherwise
 * throttles CPU to near zero whenever no request is in flight, and an analysis picked up as a
 * drain returns — or one still running when a caller disconnects — would crawl instead of
 * failing, which is far harder to diagnose.
 */

const config = loadConfig();
const logger = pino({ level: config.logLevel });

const PORT = Number(process.env.PORT ?? 8080);
const IDLE_MS = Number(process.env.ANALYZER_DRAIN_IDLE_MS ?? 10_000);
const MAX_MS = Number(process.env.ANALYZER_DRAIN_MAX_MS ?? 45 * 60_000);

const worker = startWorker(config, logger);
await worker.started;
logger.info({ port: PORT, idleMs: IDLE_MS, workdir: config.workdir }, "analyzer service started");

/**
 * One drain at a time. A trigger that arrives while the queue is already being drained joins the
 * run in progress rather than starting a second: the worker polls continuously, so it will pick
 * up the newly queued job and reset the idle timer by itself.
 */
let draining: Promise<{ reason: string; elapsedMs: number }> | null = null;

function drain() {
  draining ??= waitUntilIdle(worker, { idleMs: IDLE_MS, maxMs: MAX_MS }).finally(() => {
    draining = null;
  });
  return draining;
}

const server = createServer((req, res) => {
  const url = req.url ?? "/";
  if (req.method === "GET" && (url === "/health" || url === "/")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (req.method === "POST" && url === "/drain") {
    const before = worker.processed();
    drain().then(
      (result) => {
        const processed = worker.processed() - before;
        logger.info({ ...result, processed }, "drain finished");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ...result, processed }));
      },
      (err) => {
        logger.error({ err }, "drain failed");
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "drain failed" }));
      },
    );
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, "0.0.0.0");

const shutdown = async (signal: string) => {
  logger.info({ signal }, "shutting down");
  server.close();
  await worker.stop();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
