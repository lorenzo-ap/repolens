import { ANALYSIS_QUEUE } from "@repolens/shared";
import pino from "pino";
import { loadConfig } from "./config";
import { startWorker } from "./worker";

/**
 * Run-to-completion worker, for hosts that bill per execution rather than per uptime.
 *
 * Consumes the queue, then exits once it has been idle for `ANALYZER_DRAIN_IDLE_MS`. The idle
 * window matters: a job enqueued a moment after start-up would be missed by an immediate exit,
 * and every second of it is billed on an empty queue, so it is short but not zero.
 *
 * `ANALYZER_DRAIN_MAX_MS` is a ceiling on the whole execution so a pathological queue cannot
 * run up a bill. Work already in flight is allowed to finish; whatever is left stays queued for
 * the next execution.
 */

const config = loadConfig();
const logger = pino({ level: config.logLevel });

const IDLE_MS = Number(process.env.ANALYZER_DRAIN_IDLE_MS ?? 15_000);
const MAX_MS = Number(process.env.ANALYZER_DRAIN_MAX_MS ?? 45 * 60_000);

const startedAt = Date.now();
const worker = startWorker(config, logger);
await worker.started;
logger.info({ queue: ANALYSIS_QUEUE, idleMs: IDLE_MS, maxMs: MAX_MS }, "analyzer drain started");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let reason = "idle";
while (true) {
  await sleep(1_000);
  const idleFor = Date.now() - worker.lastActivityAt();
  if (worker.inFlight() === 0 && idleFor >= IDLE_MS) break;
  if (Date.now() - startedAt >= MAX_MS) {
    reason = "max runtime reached";
    break;
  }
}

logger.info(
  { reason, processed: worker.processed(), elapsedMs: Date.now() - startedAt },
  "analyzer drain finished",
);
await worker.stop();
process.exit(0);
