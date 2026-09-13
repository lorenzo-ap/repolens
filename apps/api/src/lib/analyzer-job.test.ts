import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config";
import { triggerAnalyzerJob } from "./analyzer-job";

const logger = { warn: vi.fn(), debug: vi.fn() };

describe("analyzer job trigger", () => {
  it("is disabled by default", () => {
    expect(
      loadConfig({ DATABASE_URL: "postgres://x", TOKEN_ENCRYPTION_KEY: "0".repeat(64) })
        .analyzerJob,
    ).toBeNull();
  });

  it("does nothing, and touches no network, when unconfigured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(triggerAnalyzerJob(null, logger)).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("reports failure instead of throwing, so a queued analysis is never lost", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no metadata"));
    // startAnalysis has already committed the job to PostgreSQL by this point; throwing here
    // would fail the user's request over something the scheduled sweep recovers from.
    await expect(triggerAnalyzerJob("projects/p/locations/l/jobs/j", logger)).resolves.toBe(false);
    expect(logger.warn).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("treats an already-running execution as success", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "t" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("conflict", { status: 409 }));
    await expect(triggerAnalyzerJob("projects/p/locations/l/jobs/j", logger)).resolves.toBe(true);
    fetchSpy.mockRestore();
  });

  it("starts an execution when the metadata server cooperates", async () => {
    const calls: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      calls.push(String(input));
      return calls.length === 1
        ? new Response(JSON.stringify({ access_token: "t" }), { status: 200 })
        : new Response("{}", { status: 200 });
    });
    await expect(triggerAnalyzerJob("projects/p/locations/l/jobs/j", logger)).resolves.toBe(true);
    expect(calls[1]).toBe("https://run.googleapis.com/v2/projects/p/locations/l/jobs/j:run");
    fetchSpy.mockRestore();
  });
});
