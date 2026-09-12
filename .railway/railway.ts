import { defineRailway, postgres, preserve, project, service, volume } from "railway/iac";

/**
 * RepoLens on Railway: the API, the analyzer worker and their PostgreSQL database.
 *
 * The web app is not here — it runs on Vercel and reaches the API through a Next.js rewrite, so
 * the browser only ever sees the Vercel origin. Everything user-facing in the API (the CORS
 * allow-list, the CSRF Origin check and the whole GitHub OAuth round trip) is derived from
 * WEB_ORIGIN below.
 *
 * Plan and apply with `railway config plan` / `railway config apply`; see docs/06-deployment.md.
 * Secrets are never written here: `preserve()` keeps whatever is already set on Railway.
 */

/**
 * The Vercel deployment. Must match the browser's address bar exactly — scheme, host, no
 * trailing slash — or sign-in breaks: GitHub compares this against the OAuth app's callback URL
 * and the API rejects state-changing requests whose Origin does not match.
 */
const WEB_ORIGIN = "https://repolens.vercel.app";

export default defineRailway(() => {
  const db = postgres("postgres");

  /**
   * Scratch space for `git fetch`. The analyzer writes each clone into a random directory here
   * and always removes it, so this only has to hold the analyses running at once: the pipeline
   * already aborts a repository whose working tree passes LIMITS.maxWorkingTreeBytes (750 MB).
   * Sized for that ceiling plus headroom, and capped so a runaway clone cannot grow without end.
   */
  const workdir = volume("analyzer-workdir", { sizeMB: 4096 });

  /**
   * Neither service declares a source. Code reaches Railway through `railway up` from the deploy
   * workflow, which runs only after CI is green, so the tree that passed the gates is the tree
   * that gets built. Connecting the GitHub repository as well would give Railway a second,
   * ungated deploy path for the same commits.
   */
  const api = service("api", {
    start: "node apps/api/dist/main.js",
    /**
     * Migrations run between the build and the deploy, against the same database the new
     * container will use, and a failure aborts the deploy. The worker deliberately does not run
     * them: two services migrating concurrently is how you get a lock fight on a cold start.
     */
    preDeploy: "node apps/analyzer/dist/migrate.js",
    healthcheck: "/api/v1/health",
    /** /health pings PostgreSQL and pg-boss, so allow for a cold database. */
    healthcheckTimeout: 120,
    env: {
      NODE_ENV: "production",
      LOG_LEVEL: "info",
      // Railway routes the public domain to this port; EXPOSE in the Dockerfile agrees.
      PORT: "4000",
      API_PORT: "4000",
      // Only used for the CSRF allow-list — the browser never addresses the API directly.
      API_ORIGIN: "https://${{RAILWAY_PUBLIC_DOMAIN}}",
      WEB_ORIGIN,
      // Railway terminates TLS in front of the container, so client IPs arrive in
      // X-Forwarded-For. The rate limiter keys on req.ip and would otherwise see one proxy IP.
      TRUST_PROXY: "true",
      SESSION_COOKIE_NAME: "repolens_session",
      // Per-user analysis quotas. @fastify/rate-limit already bounds requests per minute; these
      // bound the expensive thing behind a request — a clone plus a full AST pass — which one
      // account could otherwise queue as fast as the worker drains it. Raise once real usage
      // is visible. The demo repository is never affected.
      MAX_CONCURRENT_ANALYSES: "2",
      MAX_ANALYSES_PER_DAY: "25",
      DATABASE_URL: db.env.DATABASE_URL,
      // Set once with `railway variables`; see the runbook. Sign-in stays disabled until the
      // GitHub pair is present, which is deliberate: the demo works without it.
      TOKEN_ENCRYPTION_KEY: preserve(),
      GITHUB_CLIENT_ID: preserve(),
      GITHUB_CLIENT_SECRET: preserve(),
    },
  });

  const analyzer = service("analyzer", {
    start: "node apps/analyzer/dist/main.js",
    // No healthcheck: the worker is a pg-boss consumer and never listens on a port.
    volumeMounts: { "/work": workdir },
    env: {
      NODE_ENV: "production",
      LOG_LEVEL: "info",
      DATABASE_URL: db.env.DATABASE_URL,
      // Decrypts the stored GitHub token to fetch private repositories; must be byte-identical
      // to the API's key or every private analysis fails to authenticate.
      TOKEN_ENCRYPTION_KEY: preserve(),
      // One analysis at a time. Each one is CPU-bound AST work plus a clone, and raising this
      // multiplies the working-tree footprint on the volume above.
      ANALYZER_CONCURRENCY: "1",
      ANALYZER_WORKDIR: "/work",
      ANALYZER_NETWORK: "true",
    },
  });

  return project("repolens", { resources: [db, api, analyzer, workdir] });
});
