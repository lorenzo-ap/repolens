import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The browser only ever reaches the API through the web origin, so `/api/v1/*` must rewrite to
 * `API_INTERNAL_URL`. If this breaks in production every session cookie becomes third-party and
 * sign-in stops working, so the destination is pinned here rather than discovered at deploy time.
 */

const original = process.env.API_INTERNAL_URL;

async function rewriteDestination(apiInternalUrl: string | undefined): Promise<string> {
  vi.resetModules();
  if (apiInternalUrl === undefined) delete process.env.API_INTERNAL_URL;
  else process.env.API_INTERNAL_URL = apiInternalUrl;
  const { default: config } = await import("../../next.config");
  const rewrites = await config.rewrites?.();
  const rules = Array.isArray(rewrites) ? rewrites : (rewrites?.beforeFiles ?? []);
  const rule = rules.find((r) => r.source === "/api/v1/:path*");
  if (!rule) throw new Error("no rewrite for /api/v1/:path*");
  return rule.destination;
}

describe("next.config rewrites", () => {
  beforeEach(() => {
    delete process.env.API_INTERNAL_URL;
  });

  afterAll(() => {
    if (original === undefined) delete process.env.API_INTERNAL_URL;
    else process.env.API_INTERNAL_URL = original;
  });

  it("proxies /api/v1/* to API_INTERNAL_URL", async () => {
    expect(await rewriteDestination("https://api.example.com")).toBe(
      "https://api.example.com/api/v1/:path*",
    );
  });

  it("tolerates a trailing slash on API_INTERNAL_URL", async () => {
    expect(await rewriteDestination("https://api.example.com/")).toBe(
      "https://api.example.com/api/v1/:path*",
    );
  });

  it("falls back to the local API when API_INTERNAL_URL is unset", async () => {
    expect(await rewriteDestination(undefined)).toBe("http://localhost:4000/api/v1/:path*");
  });
});
