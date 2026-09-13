import { randomState, safeEqual } from "@repolens/database";
import type { MeResponse } from "@repolens/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { OAUTH_STATE_COOKIE } from "../config";
import { AppError } from "../lib/errors";
import { parse } from "../lib/validate";
import { serializeUser } from "../serializers";
import { completeLogin, deleteAccount, logout, requireViewer } from "../services/auth";

const CallbackQuery = z.object({
  code: z.string().min(1).max(200),
  state: z.string().min(1).max(200),
  error: z.string().optional(),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  const { ctx } = app;
  const cookieBase = {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: ctx.config.isProduction,
  };
  // The callback lands on the web origin and is proxied to this API, so the browser stays on one
  // origin for the whole flow and the session cookie is first-party. GitHub requires the value
  // sent to /authorize and the one sent to the token exchange to be identical, hence one constant.
  const redirectUri = `${ctx.config.webOrigin}/api/v1/auth/github/callback`;

  app.get("/auth/github", async (_req, reply) => {
    if (!ctx.config.github)
      throw new AppError("internal", 503, "GitHub sign-in is not configured on this server");
    const state = randomState();
    reply.setCookie(OAUTH_STATE_COOKIE, state, { ...cookieBase, maxAge: 600 });
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", ctx.config.github.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", ctx.config.githubScopes.join(" "));
    url.searchParams.set("state", state);
    return reply.redirect(url.toString(), 302);
  });

  app.get("/auth/github/callback", async (req, reply) => {
    const query = req.query as Record<string, unknown>;
    if (typeof query.error === "string") {
      return reply.redirect(`${ctx.config.webOrigin}/?auth=denied`, 302);
    }
    const q = parse(CallbackQuery, query);
    const expected = req.cookies[OAUTH_STATE_COOKIE];
    reply.clearCookie(OAUTH_STATE_COOKIE, cookieBase);
    if (!expected || !safeEqual(expected, q.state)) {
      throw new AppError("forbidden", 403, "OAuth state mismatch; please try signing in again");
    }
    const { token, expiresAt } = await completeLogin(ctx, { code: q.code, redirectUri });
    reply.setCookie(ctx.config.sessionCookieName, token, { ...cookieBase, expires: expiresAt });
    return reply.redirect(`${ctx.config.webOrigin}/repos`, 302);
  });

  app.post("/auth/logout", async (req, reply) => {
    if (req.viewer) await logout(ctx, req.viewer.sessionId);
    reply.clearCookie(ctx.config.sessionCookieName, cookieBase);
    return { ok: true };
  });

  app.get("/me", async (req) => {
    const body: MeResponse = {
      user: req.viewer ? serializeUser(req.viewer.user) : null,
      scopes: req.viewer?.scopes ?? [],
    };
    return body;
  });

  app.delete("/me", async (req, reply) => {
    const viewer = requireViewer(req.viewer);
    await deleteAccount(ctx, viewer.user.id);
    reply.clearCookie(ctx.config.sessionCookieName, cookieBase);
    return { ok: true };
  });
};
