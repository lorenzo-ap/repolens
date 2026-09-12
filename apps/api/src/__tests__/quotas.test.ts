import { analyses } from "@repolens/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHarness, ORIGIN, seedRepository, seedUser, type TestHarness } from "./helpers";

/**
 * Per-user caps on how much analysis work one account can cost. The rate limiter in app.ts
 * bounds requests per minute; these bound the expensive thing behind the request — a clone plus
 * a full AST pass — which a request limit does nothing about.
 *
 * Small numbers here so the suite exercises the boundary rather than the defaults (2 and 25).
 */

let h: TestHarness;

beforeAll(async () => {
  h = await createHarness({ MAX_CONCURRENT_ANALYSES: "2", MAX_ANALYSES_PER_DAY: "3" });
});
afterAll(async () => h.close());
beforeEach(async () => h.reset());

const start = (cookie: string, owner: string, name: string) =>
  h.app.inject({
    method: "POST",
    url: `/api/v1/repositories/${owner}/${name}/analyses`,
    headers: { cookie, ...ORIGIN },
  });

/** Each repository allows one active analysis, so distinct repositories are needed per start. */
async function seedRepos(userId: string, count: number, prefix = "r"): Promise<string[]> {
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const name = `${prefix}${i}`;
    await seedRepository(h, { ownerUserId: userId, owner: "acme", name });
    names.push(name);
  }
  return names;
}

describe("analysis quotas", () => {
  it("caps how many analyses one user can have in flight", async () => {
    const { user, cookie } = await seedUser(h);
    const names = await seedRepos(user.id, 3);

    expect((await start(cookie, "acme", names[0] as string)).statusCode).toBe(202);
    expect((await start(cookie, "acme", names[1] as string)).statusCode).toBe(202);

    const third = await start(cookie, "acme", names[2] as string);
    expect(third.statusCode).toBe(422);
    const { error } = third.json();
    expect(error.code).toBe("limit_exceeded");
    expect(error.message).toContain("queued or running");
    expect(error.message).toContain("2");
    // The rejected analysis must not reach the queue or leave a row behind.
    expect(h.enqueued).toHaveLength(2);
  });

  it("lets the user start another once one finishes", async () => {
    const { user, cookie } = await seedUser(h);
    const names = await seedRepos(user.id, 3);
    const first = await start(cookie, "acme", names[0] as string);
    await start(cookie, "acme", names[1] as string);
    expect((await start(cookie, "acme", names[2] as string)).statusCode).toBe(422);

    await h.ctx.db
      .update(analyses)
      .set({ status: "completed" })
      .where(eq(analyses.id, first.json().analysis.id));

    expect((await start(cookie, "acme", names[2] as string)).statusCode).toBe(202);
  });

  it("re-requesting a repository that is already analyzing does not consume quota", async () => {
    const { user, cookie } = await seedUser(h);
    const names = await seedRepos(user.id, 2);
    expect((await start(cookie, "acme", names[0] as string)).statusCode).toBe(202);
    // Returns the in-flight analysis rather than counting a second one against the cap.
    for (let i = 0; i < 5; i++) {
      expect((await start(cookie, "acme", names[0] as string)).statusCode).toBe(200);
    }
    expect((await start(cookie, "acme", names[1] as string)).statusCode).toBe(202);
  });

  it("caps how many analyses one user can start in a rolling day", async () => {
    const { user, cookie } = await seedUser(h);
    const names = await seedRepos(user.id, 4);
    for (let i = 0; i < 3; i++) {
      const res = await start(cookie, "acme", names[i] as string);
      expect(res.statusCode).toBe(202);
      // Completing each one keeps the concurrency cap out of the way.
      await h.ctx.db
        .update(analyses)
        .set({ status: "completed" })
        .where(eq(analyses.id, res.json().analysis.id));
    }

    const fourth = await start(cookie, "acme", names[3] as string);
    expect(fourth.statusCode).toBe(422);
    const { error } = fourth.json();
    expect(error.code).toBe("limit_exceeded");
    expect(error.message).toContain("last 24 hours");
    // Actionable: the message says when the window frees up.
    expect(error.message).toMatch(/in (a moment|about \d+ hours?|\d+ minutes?)/);
    expect(h.enqueued).toHaveLength(3);
  });

  it("only counts the last 24 hours", async () => {
    const { user, cookie } = await seedUser(h);
    const names = await seedRepos(user.id, 4);
    for (let i = 0; i < 3; i++) {
      const res = await start(cookie, "acme", names[i] as string);
      await h.ctx.db
        .update(analyses)
        .set({ status: "completed", createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
        .where(eq(analyses.id, res.json().analysis.id));
    }
    expect((await start(cookie, "acme", names[3] as string)).statusCode).toBe(202);
  });

  it("counts each user separately", async () => {
    const alice = await seedUser(h, "alice", 1001);
    const bob = await seedUser(h, "bob", 1002);
    const aliceRepos = await seedRepos(alice.user.id, 3, "a");
    const bobRepos = await seedRepos(bob.user.id, 1, "b");

    await start(alice.cookie, "acme", aliceRepos[0] as string);
    await start(alice.cookie, "acme", aliceRepos[1] as string);
    expect((await start(alice.cookie, "acme", aliceRepos[2] as string)).statusCode).toBe(422);
    // Bob is unaffected by Alice hitting her cap.
    expect((await start(bob.cookie, "acme", bobRepos[0] as string)).statusCode).toBe(202);
  });

  it("does not count the demo repository against anyone", async () => {
    const { user, cookie } = await seedUser(h);
    const demo = await seedRepository(h, {
      ownerUserId: null,
      owner: "demo",
      name: "app",
      isDemo: true,
    });
    // Seeded demo analyses have no requesting user, which is what keeps them out of the count.
    for (let i = 0; i < 10; i++) {
      await h.ctx.db.insert(analyses).values({
        repositoryId: demo.id,
        requestedByUserId: null,
        status: "completed",
        analyzerVersion: "1.0.0",
      });
    }
    const names = await seedRepos(user.id, 1);
    expect((await start(cookie, "acme", names[0] as string)).statusCode).toBe(202);

    // And the demo itself stays read-only rather than being quota-limited.
    const onDemo = await start(cookie, "demo", "app");
    expect(onDemo.statusCode).toBe(403);
  });
});
