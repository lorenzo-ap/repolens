import * as Sentry from "@sentry/node";

/**
 * Error reporting is opt-in. With `SENTRY_DSN` unset nothing is initialised and `reportError` is
 * a no-op, which is how the API runs locally, under test and in CI — no network calls, no SDK
 * instrumentation, no behaviour change. Setting the DSN in production turns it on.
 */

let enabled = false;

export interface ErrorReportingOptions {
  dsn: string | null;
  environment: string;
  release: string;
}

export function initErrorReporting(options: ErrorReportingOptions): boolean {
  if (!options.dsn) return false;
  Sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    release: options.release,
    // Errors only. Every open analysis page polls this API on a timer, so tracing would burn the
    // quota on requests that are healthy by construction.
    tracesSampleRate: 0,
    // This process handles GitHub access tokens and session cookies. Never let the SDK attach
    // request bodies, headers or IP addresses to an event.
    sendDefaultPii: false,
  });
  enabled = true;
  return true;
}

export function reportError(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export async function closeErrorReporting(timeoutMs = 2000): Promise<void> {
  if (!enabled) return;
  await Sentry.close(timeoutMs);
}
