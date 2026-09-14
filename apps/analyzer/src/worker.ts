import { createDatabase, TokenCipher } from "@repolens/database";
import { ANALYSIS_QUEUE, type AnalysisJobPayload, LIMITS } from "@repolens/shared";
import { PgBoss } from "pg-boss";
import type { Logger } from "pino";
import type { AnalyzerConfig } from "./config";
import { runAnalysis } from "./run-analysis";

/**
 * Queue consumption, shared by the two ways the worker runs:
 *
 * - `main.ts` keeps the process alive and polls forever. This is what `docker compose` and any
 *   self-hosted deployment run.
 * - `drain.ts` processes whatever is queued and exits, for hosts that only offer run-to-
 *   completion jobs rather than an always-on process.
 *
 * Both go through the same handler, so a repository analyzed by one is analyzed identically by
 * the other.
 */

export interface Worker {
  /** Resolves once the worker is consuming the queue. */
  started: Promise<void>;
  /** Jobs currently being processed. */
  inFlight(): number;
  /** Epoch ms of the last time a job started or finished; seeded at construction. */
  lastActivityAt(): number;
  /** Total jobs processed, successfully or not. */
  processed(): number;
  stop(): Promise<void>;
}

export interface IdleOptions {
  /**
   * How long the queue must stay quiet before the worker is considered done. Exiting the moment
   * it looks empty would miss a job enqueued a moment after start-up, so this is short but not
   * zero.
   */
  idleMs: number;
  /** Ceiling on one drain, so a pathological queue cannot run without end. */
  maxMs: number;
}

/** Resolves once the queue has been quiet for `idleMs`, or `maxMs` has elapsed. */
export async function waitUntilIdle(
  worker: Worker,
  { idleMs, maxMs }: IdleOptions,
): Promise<{ reason: "idle" | "max runtime reached"; elapsedMs: number }> {
  const startedAt = Date.now();
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const now = Date.now();
    // Measured from the later of this drain's start and the last job, never from the last job
    // alone. On an instance that is already warm, lastActivityAt is minutes old, so the original
    // check was satisfied on the first tick and the drain returned before pg-boss had polled for
    // the job that triggered it — ending the request, and with it the CPU allocation, while the
    // analysis was only just beginning.
    const quietSince = Math.max(worker.lastActivityAt(), startedAt);
    if (worker.inFlight() === 0 && now - quietSince >= idleMs) {
      return { reason: "idle", elapsedMs: now - startedAt };
    }
    if (now - startedAt >= maxMs) {
      return { reason: "max runtime reached", elapsedMs: now - startedAt };
    }
  }
}

export function startWorker(config: AnalyzerConfig, logger: Logger): Worker {
  const database = createDatabase(config.databaseUrl, { max: 4 });
  const cipher = config.tokenEncryptionKey ? new TokenCipher(config.tokenEncryptionKey) : null;
  if (!cipher) logger.warn("TOKEN_ENCRYPTION_KEY not set: private repositories cannot be cloned");

  const boss = new PgBoss({ connectionString: config.databaseUrl, schema: "pgboss", max: 2 });
  boss.on("error", (err) => logger.error({ err }, "pg-boss error"));

  let inFlight = 0;
  let processed = 0;
  let lastActivityAt = Date.now();

  const started = (async () => {
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
        inFlight += jobs.length;
        lastActivityAt = Date.now();
        try {
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
            processed += 1;
          }
        } finally {
          inFlight -= jobs.length;
          lastActivityAt = Date.now();
        }
      },
    );
  })();

  return {
    started,
    inFlight: () => inFlight,
    lastActivityAt: () => lastActivityAt,
    processed: () => processed,
    async stop() {
      await boss.stop({ graceful: true, timeout: 30_000 });
      await database.close();
    },
  };
}
