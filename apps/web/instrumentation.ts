import type { Instrumentation } from "next";

/**
 * Optional server-side error reporting for the web app.
 *
 * Like the API, this is opt-in: with `SENTRY_DSN` unset nothing is initialised, nothing is sent
 * and `onRequestError` returns immediately, so local development, the test suites and CI are
 * unaffected. Setting the variable in Vercel turns it on for that environment.
 *
 * This covers errors thrown on the server — server components, route handlers, and the rewrite
 * to the API. Errors thrown in the browser are not captured; `@sentry/nextjs` is the upgrade
 * path if that is wanted, at the cost of a build-time plugin and a larger client bundle.
 */

let enabled = false;

export async function register(): Promise<void> {
  // `register` also runs on the edge runtime, where the Node SDK cannot load.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  const Sentry = await import("@sentry/node");
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
  enabled = true;
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (!enabled) return;
  const Sentry = await import("@sentry/node");
  Sentry.captureException(err, {
    extra: { path: request.path, method: request.method, ...context },
  });
};
