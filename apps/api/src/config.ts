import { z } from "zod";

const ConfigSchema = z.object({
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_HOST: z.string().default("0.0.0.0"),
  API_ORIGIN: z.string().url().default("http://localhost:4000"),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  TOKEN_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, "64 hex characters expected"),
  SESSION_COOKIE_NAME: z.string().default("repolens_session"),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "silent"]).default("info"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Trust X-Forwarded-* headers (behind a reverse proxy). */
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
  /** Optional. Error reporting stays off entirely while this is unset. */
  SENTRY_DSN: z.string().url().optional(),
  /** Per-user cap on analyses queued or running at the same time. */
  MAX_CONCURRENT_ANALYSES: z.coerce.number().int().min(1).max(100).default(2),
  /** Per-user cap on analyses started in any rolling 24 hours. */
  MAX_ANALYSES_PER_DAY: z.coerce.number().int().min(1).max(10_000).default(25),
  /**
   * OAuth scopes requested from GitHub, comma or space separated.
   *
   * The default covers public repositories only. `repo` is what private-repository analysis
   * needs, but it also grants read/write on every private repository the user owns — worth
   * asking for on a self-hosted instance you control, not from strangers on a public one.
   */
  GITHUB_OAUTH_SCOPES: z.string().default("read:user,public_repo"),
  /**
   * Base URL of the analyzer service, nudged when an analysis is queued so a scale-to-zero
   * worker wakes immediately. Leave unset wherever the worker is a long-running process that
   * polls the queue itself.
   */
  ANALYZER_URL: z.string().url().optional(),
});

export type ApiConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid API configuration: ${issues}`);
  }
  const c = parsed.data;
  return {
    databaseUrl: c.DATABASE_URL,
    port: c.API_PORT,
    host: c.API_HOST,
    apiOrigin: c.API_ORIGIN.replace(/\/$/, ""),
    webOrigin: c.WEB_ORIGIN.replace(/\/$/, ""),
    tokenEncryptionKey: c.TOKEN_ENCRYPTION_KEY,
    sessionCookieName: c.SESSION_COOKIE_NAME,
    github:
      c.GITHUB_CLIENT_ID && c.GITHUB_CLIENT_SECRET
        ? { clientId: c.GITHUB_CLIENT_ID, clientSecret: c.GITHUB_CLIENT_SECRET }
        : null,
    logLevel: c.LOG_LEVEL,
    nodeEnv: c.NODE_ENV,
    trustProxy: c.TRUST_PROXY === "true",
    sentryDsn: c.SENTRY_DSN ?? null,
    githubScopes: c.GITHUB_OAUTH_SCOPES.split(/[,\s]+/).filter(Boolean),
    analyzerUrl: c.ANALYZER_URL ?? null,
    quotas: {
      concurrentAnalyses: c.MAX_CONCURRENT_ANALYSES,
      analysesPerDay: c.MAX_ANALYSES_PER_DAY,
    },
    isProduction: c.NODE_ENV === "production",
  };
}

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const OAUTH_STATE_COOKIE = "repolens_oauth_state";
