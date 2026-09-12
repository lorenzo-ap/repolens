import { expect, test } from "@playwright/test";

/**
 * In production the API has no browser-facing origin of its own: the browser talks to
 * `<WEB_ORIGIN>/api/v1/*` and Next.js rewrites to `API_INTERNAL_URL`. That only keeps sessions
 * first-party if the rewrite is transparent in both directions, so these tests assert the three
 * properties the deployment depends on: request headers reach the API (Origin and Cookie), and
 * the API's response headers — above all `Set-Cookie` — come back unchanged.
 *
 * Runs against the web origin only; it never talks to the API directly.
 */

const SESSION_COOKIE = "repolens_session";
const OAUTH_STATE_COOKIE = "repolens_oauth_state";

const setCookieHeaders = (res: import("@playwright/test").APIResponse): string[] =>
  res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value);

test.describe("API proxy", () => {
  test("forwards to the API and preserves its response headers", async ({ request }) => {
    const res = await request.get("/api/v1/health");
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", database: true, queue: true });
    // Set by the API's onRequest hook, so its presence proves the response came from the API
    // with its headers intact rather than from a Next.js route.
    expect(res.headers()["x-request-id"]).toMatch(/^[0-9a-f-]{8}-/);
  });

  test("forwards the Origin header so the API's CSRF check accepts the web origin", async ({
    request,
    baseURL,
  }) => {
    const res = await request.post("/api/v1/auth/logout", { headers: { origin: baseURL ?? "" } });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("returns Set-Cookie from the API unchanged and without a Domain", async ({
    request,
    baseURL,
  }) => {
    const res = await request.post("/api/v1/auth/logout", { headers: { origin: baseURL ?? "" } });
    const cookies = setCookieHeaders(res);
    const session = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
    expect(
      session,
      `expected a ${SESSION_COOKIE} cookie in ${JSON.stringify(cookies)}`,
    ).toBeTruthy();
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Lax/i);
    expect(session).toMatch(/Path=\//i);
    // No Domain attribute: the cookie must stay scoped to the web origin, never shared with a
    // parent domain that the API might also sit under.
    expect(session).not.toMatch(/Domain=/i);
  });

  test("forwards request cookies to the API", async ({ request }) => {
    // The OAuth callback compares the `state` query parameter against the state cookie. Sending a
    // matching pair gets past that check and fails later (sign-in unconfigured, or the code
    // exchange with GitHub) — a mismatch or a dropped cookie is the only way to get a 403 here,
    // which makes the status a reliable signal that the Cookie header survived the rewrite.
    const state = "proxy-cookie-forwarding-probe";
    const res = await request.get(`/api/v1/auth/github/callback?code=probe&state=${state}`, {
      headers: { cookie: `${OAUTH_STATE_COOKIE}=${state}` },
      maxRedirects: 0,
    });
    expect(res.status(), "403 means the state cookie never reached the API").not.toBe(403);
  });

  test("rejects a cross-site Origin through the proxy", async ({ request }) => {
    const res = await request.post("/api/v1/auth/logout", {
      headers: { origin: "https://attacker.example" },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe("forbidden");
  });
});
