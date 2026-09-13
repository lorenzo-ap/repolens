import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config";
import { triggerAnalyzer } from "./analyzer-trigger";

const logger = { warn: vi.fn(), debug: vi.fn() };
const base = { DATABASE_URL: "postgres://x", TOKEN_ENCRYPTION_KEY: "0".repeat(64) };

describe("analyzer trigger", () => {
  it("is disabled by default", () => {
    expect(loadConfig(base).analyzerUrl).toBeNull();
  });

  it("rejects a malformed URL rather than silently never triggering", () => {
    expect(() => loadConfig({ ...base, ANALYZER_URL: "not-a-url" })).toThrow(/ANALYZER_URL/);
  });

  it("does nothing, and touches no network, when unconfigured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(triggerAnalyzer(null, logger)).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("reports failure instead of throwing, so a queued analysis is never lost", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no metadata"));
    // startAnalysis has already committed the job to PostgreSQL by this point; throwing here
    // would fail the user's request over something the scheduled sweep recovers from.
    await expect(triggerAnalyzer("https://analyzer.example", logger)).resolves.toBe(false);
    expect(logger.warn).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("requests an identity token for the analyzer's own audience and posts to /drain", async () => {
    const calls: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      calls.push(String(input));
      return calls.length === 1 ? new Response("id-token", { status: 200 }) : new Response("{}");
    });
    await expect(triggerAnalyzer("https://analyzer.example/", logger)).resolves.toBe(true);
    // Cloud Run rejects a token minted for any other audience.
    expect(calls[0]).toContain("audience=https%3A%2F%2Fanalyzer.example%2F");
    // Trailing slash on the base URL must not produce a double slash.
    expect(calls[1]).toBe("https://analyzer.example/drain");
    fetchSpy.mockRestore();
  });

  it("does not wait for the drain, which can take minutes", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("metadata")) return new Response("id-token", { status: 200 });
      // A drain that never resolves must not block the caller.
      return new Promise<Response>(() => {});
    });
    await expect(triggerAnalyzer("https://analyzer.example", logger)).resolves.toBe(true);
    fetchSpy.mockRestore();
  });
});
