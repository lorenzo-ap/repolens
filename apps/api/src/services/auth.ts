import { generateSessionToken, hashSessionToken, sessions, users } from "@repolens/database";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { SESSION_TTL_MS } from "../config";
import type { AppContext, Viewer } from "../context";
import { UnauthorizedError } from "../lib/errors";

/** Resolves the viewer for a raw session token from the cookie, touching lastSeenAt at most hourly. */
export async function resolveViewer(
  ctx: AppContext,
  token: string | undefined,
): Promise<Viewer | null> {
  if (!token || token.length > 200) return null;
  const hash = hashSessionToken(token);
  const [row] = await ctx.db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, hash), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  if (Date.now() - row.session.lastSeenAt.getTime() > 60 * 60 * 1000) {
    await ctx.db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, hash));
  }
  const { encryptedGithubToken } = row.session;
  return {
    user: row.user,
    sessionId: hash,
    scopes: row.session.scopes,
    githubToken: () => ctx.cipher.decrypt(encryptedGithubToken),
  };
}

export interface CompleteLoginInput {
  code: string;
  redirectUri: string;
}

/** Exchanges the OAuth code, upserts the user and creates a session. Returns the raw cookie token. */
export async function completeLogin(
  ctx: AppContext,
  input: CompleteLoginInput,
): Promise<{ token: string; expiresAt: Date }> {
  if (!ctx.github) throw new UnauthorizedError("GitHub sign-in is not configured on this server");
  const { accessToken, scopes } = await ctx.github.exchangeCode(input.code, input.redirectUri);
  const ghUser = await ctx.github.getUser(accessToken);

  const [user] = await ctx.db
    .insert(users)
    .values({
      githubId: ghUser.id,
      login: ghUser.login,
      name: ghUser.name,
      avatarUrl: ghUser.avatar_url,
    })
    .onConflictDoUpdate({
      target: users.githubId,
      set: {
        login: ghUser.login,
        name: ghUser.name,
        avatarUrl: ghUser.avatar_url,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  if (!user) throw new Error("failed to upsert user");

  const { token, hash } = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await ctx.db.insert(sessions).values({
    id: hash,
    userId: user.id,
    encryptedGithubToken: ctx.cipher.encrypt(accessToken),
    scopes,
    expiresAt,
  });
  ctx.logger.info({ userId: user.id, login: user.login }, "user signed in");
  return { token, expiresAt };
}

export async function logout(ctx: AppContext, sessionId: string): Promise<void> {
  await ctx.db.delete(sessions).where(eq(sessions.id, sessionId));
}

/** Deletes the user and, through cascades, their sessions, repositories and analyses. */
export async function deleteAccount(ctx: AppContext, userId: string): Promise<void> {
  await ctx.db.delete(users).where(eq(users.id, userId));
  ctx.logger.info({ userId }, "account deleted");
}

/** Removes expired sessions; called on startup and periodically. */
export async function purgeExpiredSessions(ctx: AppContext): Promise<number> {
  const deleted = await ctx.db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });
  if (deleted.length) ctx.logger.info({ count: deleted.length }, "expired sessions purged");
  return deleted.length;
}

export function requireViewer(viewer: Viewer | null): Viewer {
  if (!viewer) throw new UnauthorizedError();
  return viewer;
}
