import { describe, expect, it } from "vitest";
import { loadConfig } from "../config";
import { initErrorReporting, reportError } from "./sentry";

const base = {
  DATABASE_URL: "postgres://localhost/x",
  TOKEN_ENCRYPTION_KEY: "0".repeat(64),
};

describe("error reporting", () => {
  it("is off when SENTRY_DSN is unset", () => {
    expect(loadConfig(base).sentryDsn).toBeNull();
    expect(initErrorReporting({ dsn: null, environment: "test", release: "0" })).toBe(false);
    // Reporting while disabled must not throw: the API's error handler calls this on every 5xx.
    expect(() => reportError(new Error("boom"), { requestId: "abc" })).not.toThrow();
  });

  it("reads a DSN from the environment", () => {
    const dsn = "https://publickey@o0.ingest.sentry.io/1";
    expect(loadConfig({ ...base, SENTRY_DSN: dsn }).sentryDsn).toBe(dsn);
  });

  it("rejects a malformed DSN rather than starting with reporting silently off", () => {
    expect(() => loadConfig({ ...base, SENTRY_DSN: "not-a-url" })).toThrow(/SENTRY_DSN/);
  });
});

describe("github oauth scopes", () => {
  it("asks for public repositories only by default", () => {
    expect(loadConfig(base).githubScopes).toEqual(["read:user", "public_repo"]);
  });

  it("can be widened for a self-hosted instance that analyzes private repositories", () => {
    expect(loadConfig({ ...base, GITHUB_OAUTH_SCOPES: "read:user, repo" }).githubScopes).toEqual([
      "read:user",
      "repo",
    ]);
  });
});
