import { describe, expect, it } from "vitest";
import { type Worker, waitUntilIdle } from "../worker";

/** A worker whose activity clock and in-flight count the test drives directly. */
function fakeWorker(overrides: Partial<Worker> = {}): Worker {
  return {
    started: Promise.resolve(),
    inFlight: () => 0,
    lastActivityAt: () => Date.now(),
    processed: () => 0,
    stop: async () => {},
    ...overrides,
  };
}

describe("waitUntilIdle", () => {
  it("waits a full idle window even when the worker has been quiet for ages", async () => {
    // The regression this guards: on a warm instance lastActivityAt is minutes old, so returning
    // as soon as `now - lastActivityAt >= idleMs` ended the drain on the first tick — before
    // pg-boss had polled for the job that triggered it. The request closed, and Cloud Run
    // throttles CPU to near zero with no request in flight, so the analysis crawled.
    const ancient = Date.now() - 10 * 60_000;
    const startedAt = Date.now();
    const result = await waitUntilIdle(fakeWorker({ lastActivityAt: () => ancient }), {
      idleMs: 3_000,
      maxMs: 60_000,
    });
    expect(result.reason).toBe("idle");
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(3_000);
  });

  it("keeps waiting while a job is in flight", async () => {
    let inFlight = 1;
    setTimeout(() => {
      inFlight = 0;
    }, 2_500);
    const result = await waitUntilIdle(
      fakeWorker({ inFlight: () => inFlight, lastActivityAt: () => Date.now() - 60_000 }),
      { idleMs: 1_000, maxMs: 30_000 },
    );
    expect(result.reason).toBe("idle");
    expect(result.elapsedMs).toBeGreaterThanOrEqual(2_500);
  });

  it("gives up at the ceiling rather than running without end", async () => {
    const result = await waitUntilIdle(fakeWorker({ inFlight: () => 1 }), {
      idleMs: 1_000,
      maxMs: 2_000,
    });
    expect(result.reason).toBe("max runtime reached");
  });
});
