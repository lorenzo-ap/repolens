import type { AnalysisDetail, CompareResponse, FindingsPage } from "@repolens/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createHarness,
  ghRepo,
  ORIGIN,
  seedCompletedAnalysis,
  seedRepository,
  seedUser,
  type TestHarness,
} from "./helpers";

let h: TestHarness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h.close());
beforeEach(async () => h.reset());

describe("health and errors", () => {
  it("reports health", async () => {
    const res = await h.app.inject({ method: "GET", url: "/api/v1/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok", database: true, queue: true });
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("returns a structured 404 for unknown routes", async () => {
    const res = await h.app.inject({ method: "GET", url: "/api/v1/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("not_found");
  });

  it("rejects mutations without a trusted Origin", async () => {
    const res = await h.app.inject({ method: "POST", url: "/api/v1/auth/logout" });
    expect(res.statusCode).toBe(403);
    const evil = await h.app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { origin: "https://evil.example" },
    });
    expect(evil.statusCode).toBe(403);
    const ok = await h.app.inject({ method: "POST", url: "/api/v1/auth/logout", headers: ORIGIN });
    expect(ok.statusCode).toBe(200);
  });
});

describe("auth", () => {
  it("returns null for anonymous /me and the user for a valid session", async () => {
    const anon = await h.app.inject({ method: "GET", url: "/api/v1/me" });
    expect(anon.json()).toEqual({ user: null, scopes: [] });
    const { user, cookie } = await seedUser(h);
    const me = await h.app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie } });
    expect(me.json().user).toMatchObject({ id: user.id, login: "alice" });
    expect(me.json().scopes).toEqual(["read:user", "repo"]);
  });

  it("ignores garbage session cookies", async () => {
    const me = await h.app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { cookie: "repolens_session=nonsense" },
    });
    expect(me.json().user).toBeNull();
  });

  it("redirects to GitHub with a state cookie", async () => {
    const res = await h.app.inject({ method: "GET", url: "/api/v1/auth/github" });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain("https://github.com/login/oauth/authorize");
    expect(res.headers.location).toContain("scope=read%3Auser+repo");
    expect(String(res.headers["set-cookie"])).toContain("repolens_oauth_state=");
  });

  // In production the browser only ever sees the web origin; the API is reachable through the
  // web app's /api/v1/* rewrite. The whole OAuth round trip therefore has to stay on WEB_ORIGIN,
  // otherwise the session cookie is set on a different site and sign-in silently does nothing.
  it("keeps the entire OAuth flow on the web origin", async () => {
    const authorize = await h.app.inject({ method: "GET", url: "/api/v1/auth/github" });
    const redirectUri = new URL(String(authorize.headers.location)).searchParams.get(
      "redirect_uri",
    );
    expect(redirectUri).toBe("http://localhost:3000/api/v1/auth/github/callback");
    expect(redirectUri).not.toContain(h.ctx.config.apiOrigin);

    const callback = await h.app.inject({
      method: "GET",
      url: "/api/v1/auth/github/callback?code=abc&state=s1",
      headers: { cookie: "repolens_oauth_state=s1" },
    });
    // GitHub compares the two redirect_uri values, so the token exchange must send the same one.
    expect(h.github.redirectUris).toEqual([redirectUri]);
    expect(callback.headers.location).toBe("http://localhost:3000/repos");
  });

  it("sends the user back to the web origin when they deny access", async () => {
    const res = await h.app.inject({
      method: "GET",
      url: "/api/v1/auth/github/callback?error=access_denied",
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("http://localhost:3000/?auth=denied");
  });

  it("sets the session cookie without a Domain so it stays first-party", async () => {
    const res = await h.app.inject({
      method: "GET",
      url: "/api/v1/auth/github/callback?code=abc&state=s1",
      headers: { cookie: "repolens_oauth_state=s1" },
    });
    const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
    const session = cookies.find((c) => c.startsWith("repolens_session="));
    // A Domain attribute would widen the cookie to every subdomain of the web origin, including
    // the API host if it ever moves under the same parent domain.
    expect(session).not.toMatch(/Domain=/i);
    expect(session).toMatch(/Path=\//);
  });

  it("rejects a callback whose state does not match", async () => {
    const res = await h.app.inject({
      method: "GET",
      url: "/api/v1/auth/github/callback?code=abc&state=zzz",
      headers: { cookie: "repolens_oauth_state=other" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("completes login and creates a session", async () => {
    const res = await h.app.inject({
      method: "GET",
      url: "/api/v1/auth/github/callback?code=abc&state=s1",
      headers: { cookie: "repolens_oauth_state=s1" },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("http://localhost:3000/repos");
    const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
    const session = cookies.find((c) => c.startsWith("repolens_session="));
    expect(session).toMatch(/HttpOnly/);
    expect(session).toMatch(/SameSite=Lax/);
    const token = session?.split(";")[0] ?? "";
    const me = await h.app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: token } });
    expect(me.json().user.login).toBe("alice");
    const out = await h.app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { cookie: token, ...ORIGIN },
    });
    expect(out.statusCode).toBe(200);
    const after = await h.app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { cookie: token },
    });
    expect(after.json().user).toBeNull();
  });

  it("deletes the account and everything it owns", async () => {
    const { user, cookie } = await seedUser(h);
    const repo = await seedRepository(h, { ownerUserId: user.id });
    await seedCompletedAnalysis(h, repo.id);
    const res = await h.app.inject({
      method: "DELETE",
      url: "/api/v1/me",
      headers: { cookie, ...ORIGIN },
    });
    expect(res.statusCode).toBe(200);
    const gone = await h.app.inject({ method: "GET", url: "/api/v1/repositories/acme/widgets" });
    expect(gone.statusCode).toBe(404);
  });
});

describe("repositories", () => {
  it("requires auth for the GitHub listing and annotates local state", async () => {
    const anon = await h.app.inject({ method: "GET", url: "/api/v1/github/repos" });
    expect(anon.statusCode).toBe(401);
    const { user, cookie } = await seedUser(h);
    h.github.repos = [
      ghRepo({ owner: { login: "alice" }, name: "one" }),
      ghRepo({ owner: { login: "alice" }, name: "two" }),
    ];
    const local = await seedRepository(h, { ownerUserId: user.id, owner: "alice", name: "two" });
    await seedCompletedAnalysis(h, local.id, { healthScore: 81 });
    const res = await h.app.inject({
      method: "GET",
      url: "/api/v1/github/repos",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.repos).toHaveLength(2);
    expect(body.repos[0].local).toBeNull();
    expect(body.repos[1].local.latestAnalysis.healthScore).toBe(81);
  });

  it("adds a repository after checking GitHub and is idempotent", async () => {
    const { cookie } = await seedUser(h);
    h.github.repos = [ghRepo({ owner: { login: "alice" }, name: "one", private: true })];
    const first = await h.app.inject({
      method: "POST",
      url: "/api/v1/repositories",
      headers: { cookie, ...ORIGIN },
      payload: { owner: "alice", name: "one" },
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().repository).toMatchObject({
      fullName: "alice/one",
      isPrivate: true,
      canManage: true,
    });
    const second = await h.app.inject({
      method: "POST",
      url: "/api/v1/repositories",
      headers: { cookie, ...ORIGIN },
      payload: { owner: "alice", name: "one" },
    });
    expect(second.json().repository.id).toBe(first.json().repository.id);
    const missing = await h.app.inject({
      method: "POST",
      url: "/api/v1/repositories",
      headers: { cookie, ...ORIGIN },
      payload: { owner: "alice", name: "nope" },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe("github_error");
  });

  it("rejects repositories above the size limit", async () => {
    const { cookie } = await seedUser(h);
    h.github.repos = [ghRepo({ owner: { login: "alice" }, name: "huge", size: 600 * 1024 })];
    const res = await h.app.inject({
      method: "POST",
      url: "/api/v1/repositories",
      headers: { cookie, ...ORIGIN },
      payload: { owner: "alice", name: "huge" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toMatch(/limit/);
  });

  it("validates request bodies", async () => {
    const { cookie } = await seedUser(h);
    const res = await h.app.inject({
      method: "POST",
      url: "/api/v1/repositories",
      headers: { cookie, ...ORIGIN },
      payload: { owner: "" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("validation_failed");
    expect(res.json().error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "name" })]),
    );
  });

  it("hides other users' repositories and exposes demo repositories to everyone", async () => {
    const alice = await seedUser(h, "alice", 1);
    const bob = await seedUser(h, "bob", 2);
    await seedRepository(h, {
      ownerUserId: alice.user.id,
      owner: "alice",
      name: "secret",
      isPrivate: true,
    });
    await seedRepository(h, { ownerUserId: null, owner: "demo", name: "app", isDemo: true });
    const asBob = await h.app.inject({
      method: "GET",
      url: "/api/v1/repositories/alice/secret",
      headers: { cookie: bob.cookie },
    });
    expect(asBob.statusCode).toBe(404);
    const asAlice = await h.app.inject({
      method: "GET",
      url: "/api/v1/repositories/alice/secret",
      headers: { cookie: alice.cookie },
    });
    expect(asAlice.statusCode).toBe(200);
    expect(asAlice.json().repository.canManage).toBe(true);
    const demoAnon = await h.app.inject({ method: "GET", url: "/api/v1/repositories/demo/app" });
    expect(demoAnon.statusCode).toBe(200);
    expect(demoAnon.json().repository).toMatchObject({ isDemo: true, canManage: false });
    const del = await h.app.inject({
      method: "DELETE",
      url: "/api/v1/repositories/demo/app",
      headers: { cookie: bob.cookie, ...ORIGIN },
    });
    expect(del.statusCode).toBe(403);
  });
});

describe("analyses", () => {
  it("queues an analysis, dedupes active ones, and reports progress", async () => {
    const { user, cookie } = await seedUser(h);
    await seedRepository(h, { ownerUserId: user.id });
    const start = await h.app.inject({
      method: "POST",
      url: "/api/v1/repositories/acme/widgets/analyses",
      headers: { cookie, ...ORIGIN },
    });
    expect(start.statusCode).toBe(202);
    const { analysis } = start.json();
    expect(analysis.status).toBe("queued");
    expect(h.enqueued).toEqual([{ analysisId: analysis.id }]);
    const again = await h.app.inject({
      method: "POST",
      url: "/api/v1/repositories/acme/widgets/analyses",
      headers: { cookie, ...ORIGIN },
    });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ created: false, analysis: { id: analysis.id } });
    const detail = await h.app.inject({
      method: "GET",
      url: `/api/v1/analyses/${analysis.id}`,
      headers: { cookie },
    });
    const body = detail.json() as AnalysisDetail;
    expect(body.steps).toHaveLength(10);
    expect(body.steps[0]).toMatchObject({ key: "clone", status: "pending" });
    const list = await h.app.inject({
      method: "GET",
      url: "/api/v1/repositories/acme/widgets/analyses",
      headers: { cookie },
    });
    expect(list.json().analyses).toHaveLength(1);
    const cancel = await h.app.inject({
      method: "POST",
      url: `/api/v1/analyses/${analysis.id}/cancel`,
      headers: { cookie, ...ORIGIN },
    });
    expect(cancel.statusCode).toBe(200);
    const after = await h.app.inject({
      method: "GET",
      url: `/api/v1/analyses/${analysis.id}`,
      headers: { cookie },
    });
    expect(after.json().analysis.status).toBe("cancelled");
  });

  it("refuses to analyze the demo repository", async () => {
    const { cookie } = await seedUser(h);
    await seedRepository(h, { ownerUserId: null, owner: "demo", name: "app", isDemo: true });
    const res = await h.app.inject({
      method: "POST",
      url: "/api/v1/repositories/demo/app/analyses",
      headers: { cookie, ...ORIGIN },
    });
    expect(res.statusCode).toBe(403);
    expect(h.enqueued).toHaveLength(0);
  });

  it("returns the demo overview", async () => {
    const empty = await h.app.inject({ method: "GET", url: "/api/v1/demo" });
    expect(empty.statusCode).toBe(404);
    const repo = await seedRepository(h, {
      ownerUserId: null,
      owner: "demo",
      name: "app",
      isDemo: true,
    });
    await seedCompletedAnalysis(h, repo.id, {
      healthScore: 66,
      findings: [
        { ruleId: "testing/no-tests", severity: "critical", category: "testing", filePath: null },
        {
          ruleId: "quality/long-function",
          severity: "medium",
          category: "quality",
          filePath: "src/a.ts",
        },
      ],
    });
    const res = await h.app.inject({ method: "GET", url: "/api/v1/demo" });
    expect(res.statusCode).toBe(200);
    expect(res.json().latestAnalysis.healthScore).toBe(66);
    expect(res.json().topFindings[0].severity).toBe("critical");
    expect(res.headers["cache-control"]).toContain("public");
  });
});

describe("findings", () => {
  const seed = async () => {
    const { user, cookie } = await seedUser(h);
    const repo = await seedRepository(h, { ownerUserId: user.id });
    const analysis = await seedCompletedAnalysis(h, repo.id, {
      findings: [
        {
          ruleId: "quality/empty-catch",
          severity: "high",
          category: "quality",
          filePath: "src/a.ts",
          symbol: "c1",
        },
        {
          ruleId: "quality/long-function",
          severity: "medium",
          category: "quality",
          filePath: "src/a.ts",
          symbol: "f1",
        },
        {
          ruleId: "arch/circular-dependency",
          severity: "high",
          category: "architecture",
          filePath: "src/b.ts",
          symbol: "cy",
        },
        { ruleId: "testing/no-tests", severity: "critical", category: "testing", filePath: null },
        {
          ruleId: "ts/explicit-any",
          severity: "low",
          category: "quality",
          filePath: "src/lib/c.ts",
          symbol: "any",
        },
      ],
    });
    return { cookie, repo, analysis };
  };

  it("lists by severity with pagination and rule facets", async () => {
    const { cookie, analysis } = await seed();
    const p1 = await h.app.inject({
      method: "GET",
      url: `/api/v1/analyses/${analysis.id}/findings?limit=2`,
      headers: { cookie },
    });
    const page1 = p1.json() as FindingsPage;
    expect(page1.total).toBe(5);
    expect(page1.findings.map((f) => f.severity)).toEqual(["critical", "high"]);
    expect(page1.nextCursor).toBeTruthy();
    expect(page1.rules.map((r) => r.ruleId)).toContain("quality/empty-catch");
    const p2 = await h.app.inject({
      method: "GET",
      url: `/api/v1/analyses/${analysis.id}/findings?limit=2&cursor=${page1.nextCursor}`,
      headers: { cookie },
    });
    const page2 = p2.json() as FindingsPage;
    expect(page2.findings.map((f) => f.severity)).toEqual(["high", "medium"]);
    const p3 = await h.app.inject({
      method: "GET",
      url: `/api/v1/analyses/${analysis.id}/findings?limit=2&cursor=${page2.nextCursor}`,
      headers: { cookie },
    });
    expect(p3.json().findings.map((f: { severity: string }) => f.severity)).toEqual(["low"]);
    expect(p3.json().nextCursor).toBeNull();
    const ids = new Set(
      [...page1.findings, ...page2.findings, ...p3.json().findings].map(
        (f: { id: string }) => f.id,
      ),
    );
    expect(ids.size).toBe(5);
  });

  it("filters by severity, category, path and text", async () => {
    const { cookie, analysis } = await seed();
    const bySev = await h.app.inject({
      method: "GET",
      url: `/api/v1/analyses/${analysis.id}/findings?severity=high&severity=critical`,
      headers: { cookie },
    });
    expect(bySev.json().total).toBe(3);
    const byCat = await h.app.inject({
      method: "GET",
      url: `/api/v1/analyses/${analysis.id}/findings?category=quality`,
      headers: { cookie },
    });
    expect(byCat.json().total).toBe(3);
    const byPath = await h.app.inject({
      method: "GET",
      url: `/api/v1/analyses/${analysis.id}/findings?path=src/lib`,
      headers: { cookie },
    });
    expect(byPath.json().total).toBe(1);
    const byText = await h.app.inject({
      method: "GET",
      url: `/api/v1/analyses/${analysis.id}/findings?q=circular`,
      headers: { cookie },
    });
    expect(byText.json().findings[0].ruleId).toBe("arch/circular-dependency");
    const bad = await h.app.inject({
      method: "GET",
      url: `/api/v1/analyses/${analysis.id}/findings?severity=urgent`,
      headers: { cookie },
    });
    expect(bad.statusCode).toBe(400);
    const byFile = await h.app.inject({
      method: "GET",
      url: `/api/v1/analyses/${analysis.id}/findings?sort=file`,
      headers: { cookie },
    });
    expect(byFile.json().findings.map((f: { filePath: string | null }) => f.filePath)).toEqual([
      "src/a.ts",
      "src/a.ts",
      "src/b.ts",
      "src/lib/c.ts",
      null,
    ]);
  });

  it("returns finding detail with related findings and a GitHub link", async () => {
    const { cookie, analysis } = await seed();
    const list = await h.app.inject({
      method: "GET",
      url: `/api/v1/analyses/${analysis.id}/findings?path=src/a.ts&sort=rule`,
      headers: { cookie },
    });
    const first = list.json().findings[0];
    const res = await h.app.inject({
      method: "GET",
      url: `/api/v1/analyses/${analysis.id}/findings/${first.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().related).toHaveLength(1);
    expect(res.json().githubFileUrl).toBe(
      `https://github.com/acme/widgets/blob/${"a".repeat(40)}/src/a.ts#L10`,
    );
  });

  it("creates a GitHub issue once per finding and only for managers", async () => {
    const { cookie, analysis } = await seed();
    const list = await h.app.inject({
      method: "GET",
      url: `/api/v1/analyses/${analysis.id}/findings?limit=1`,
      headers: { cookie },
    });
    const id = list.json().findings[0].id;
    const anon = await h.app.inject({
      method: "POST",
      url: `/api/v1/analyses/${analysis.id}/findings/${id}/issue`,
      headers: ORIGIN,
    });
    expect(anon.statusCode).toBe(404);
    const res = await h.app.inject({
      method: "POST",
      url: `/api/v1/analyses/${analysis.id}/findings/${id}/issue`,
      headers: { cookie, ...ORIGIN },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().url).toContain("/issues/1");
    expect(h.github.issues[0]?.title).toContain("[RepoLens]");
    expect(h.github.issues[0]?.body).toContain("Recommendation");
    const again = await h.app.inject({
      method: "POST",
      url: `/api/v1/analyses/${analysis.id}/findings/${id}/issue`,
      headers: { cookie, ...ORIGIN },
    });
    expect(again.statusCode).toBe(409);
  });
});

describe("architecture and comparison", () => {
  it("serves directory and file level graphs", async () => {
    const { user, cookie } = await seedUser(h);
    const repo = await seedRepository(h, { ownerUserId: user.id });
    const analysis = await seedCompletedAnalysis(h, repo.id);
    const dirs = await h.app.inject({
      method: "GET",
      url: `/api/v1/analyses/${analysis.id}/architecture`,
      headers: { cookie },
    });
    expect(dirs.json().nodes.map((n: { path: string }) => n.path)).toEqual(["src", "src/lib"]);
    expect(dirs.json().edges).toHaveLength(1);
    const files = await h.app.inject({
      method: "GET",
      url: `/api/v1/analyses/${analysis.id}/architecture?level=file&root=src`,
      headers: { cookie },
    });
    expect(files.json().nodes.map((n: { path: string }) => n.path)).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
    expect(files.json().edges).toHaveLength(1);
  });

  it("compares two analyses of the same repository", async () => {
    const { user, cookie } = await seedUser(h);
    const repo = await seedRepository(h, { ownerUserId: user.id });
    const older = await seedCompletedAnalysis(h, repo.id, {
      healthScore: 60,
      createdAt: new Date("2025-01-01"),
      findings: [
        {
          ruleId: "quality/empty-catch",
          severity: "high",
          category: "quality",
          filePath: "src/a.ts",
          symbol: "c1",
        },
        {
          ruleId: "quality/long-function",
          severity: "medium",
          category: "quality",
          filePath: "src/a.ts",
          symbol: "f1",
        },
      ],
    });
    const newer = await seedCompletedAnalysis(h, repo.id, {
      healthScore: 70,
      createdAt: new Date("2025-02-01"),
      findings: [
        {
          ruleId: "quality/long-function",
          severity: "medium",
          category: "quality",
          filePath: "src/a.ts",
          symbol: "f1",
        },
        {
          ruleId: "ts/explicit-any",
          severity: "low",
          category: "quality",
          filePath: "src/b.ts",
          symbol: "any",
        },
      ],
    });
    const res = await h.app.inject({
      method: "GET",
      url: `/api/v1/analyses/${newer.id}/compare/${older.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as CompareResponse;
    expect(body.scoreDeltas[0]).toEqual({ category: "health", before: 60, after: 70 });
    expect(body.findings.new.map((f) => f.ruleId)).toEqual(["ts/explicit-any"]);
    expect(body.findings.resolved.map((f) => f.ruleId)).toEqual(["quality/empty-catch"]);
    expect(body.findings.unchangedCount).toBe(1);
    const detail = await h.app.inject({
      method: "GET",
      url: `/api/v1/analyses/${newer.id}`,
      headers: { cookie },
    });
    expect(detail.json().previousAnalysisId).toBe(older.id);
  });
});
