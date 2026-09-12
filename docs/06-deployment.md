# RepoLens — Deployment

_How the three processes reach production, what each one needs, and the order to bring them up._

## Topology

```
                     ┌──────────────────────────────────────────┐
   browser  ───────► │  Vercel — apps/web (Next.js)             │
   (one origin       │  • renders the app                       │
    only)            │  • rewrites /api/v1/* ──────────────┐    │
                     └─────────────────────────────────────┼────┘
                                                           │ server-to-server,
                                                           │ public HTTPS
                     ┌─────────────────────────────────────▼────┐
                     │  Railway project "repolens"              │
                     │                                          │
                     │   api        Fastify, public domain      │
                     │    │         pre-deploy: migrate         │
                     │    │                                     │
                     │    ├── pg-boss queue ──► analyzer        │
                     │    │                     (no port,       │
                     │    │                      volume /work)  │
                     │    ▼                     ▼               │
                     │   postgres  (managed, private network)   │
                     └──────────────────────────────────────────┘
```

The browser talks to **one origin**: the Vercel domain. It never addresses the API host. Next.js
rewrites `/api/v1/*` to `API_INTERNAL_URL`, so the session cookie is first-party, no CORS
preflight is involved in normal use, and the GitHub OAuth round trip never leaves the web origin.

Consequences worth keeping in mind:

- The **session cookie is set by the API** and travels back through the rewrite unchanged. It
  carries no `Domain` attribute, so it stays scoped to the web origin.
- **CORS is not used by the browser.** The API's allow-list is still restricted to `WEB_ORIGIN`
  as a second line of defence for anything that does address it directly.
- The API's **CSRF check** compares the `Origin` header against `WEB_ORIGIN`. The rewrite
  forwards that header, which is why the check passes.
- The **OAuth callback is on the web domain** (`<WEB_ORIGIN>/api/v1/auth/github/callback`) and is
  proxied to the API, not registered against the API host.

`apps/web/e2e/api-proxy.spec.ts` asserts all four of these against a running stack.

### Why two Railway services share one image

Railway builds a Dockerfile's **final stage** and has no `--target`. The `railway` stage at the
end of the `Dockerfile` therefore carries both server entrypoints, and the two services differ
only in their start command. It is the same size as the separate `api` and `analyzer` targets —
the bulk of all three is the shared root `node_modules` — and those targets are unchanged, so
`docker compose` still builds them individually.

### Why `.railway/railway.ts` and not `railway.json`

Railway deprecated Config as Code and stops reading `railway.json` / `railway.toml` on
**2026-12-01**. Infrastructure as Code describes the whole project — both services, the database,
the volume and every non-secret variable — in one reviewable file. It is typechecked against the
Railway SDK by `pnpm typecheck`, so a misspelled field fails before a deploy does.

---

## Environment variables

Secrets are marked ⚠. Never commit them; set them with `railway variables` or in the Vercel
dashboard. `.railway/railway.ts` declares them as `preserve()`, which means "keep what is already
set on Railway" — the file never contains a secret.

### Vercel — `apps/web`

| Variable | Value | Scope |
| --- | --- | --- |
| `API_INTERNAL_URL` | the API's public URL, no trailing slash | Production + Preview |
| `SENTRY_DSN` ⚠ | optional; unset means no SDK is initialised | Production |

`API_INTERNAL_URL` is read **at build time** (it is baked into the rewrite) and at runtime by
server components. Changing it requires a redeploy, not just a restart.

### Railway — `api`

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` / `API_PORT` | `4000` (both, so Railway and the app agree) |
| `API_ORIGIN` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` — CSRF allow-list only |
| `WEB_ORIGIN` | the Vercel domain, exactly as the browser sees it |
| `TRUST_PROXY` | `true` — Railway terminates TLS, so client IPs arrive in `X-Forwarded-For` |
| `SESSION_COOKIE_NAME` | `repolens_session` |
| `DATABASE_URL` | from the managed Postgres service |
| `TOKEN_ENCRYPTION_KEY` ⚠ | 64 hex chars, `openssl rand -hex 32` |
| `GITHUB_CLIENT_ID` ⚠ | OAuth app; sign-in stays disabled without it |
| `GITHUB_CLIENT_SECRET` ⚠ | as above |
| `MAX_CONCURRENT_ANALYSES` | `2` |
| `MAX_ANALYSES_PER_DAY` | `25` |
| `SENTRY_DSN` ⚠ | optional |

### Railway — `analyzer`

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | same database as the API |
| `TOKEN_ENCRYPTION_KEY` ⚠ | **byte-identical to the API's**, or private repositories fail to clone |
| `ANALYZER_CONCURRENCY` | `1` |
| `ANALYZER_WORKDIR` | `/work`, the mounted volume |
| `ANALYZER_NETWORK` | `true` (npm advisory lookups) |

The volume is capped at 4 GB. Clones are written into a random directory under `/work` and always
removed; the pipeline aborts a repository whose working tree exceeds `LIMITS.maxWorkingTreeBytes`
(750 MB), so the cap is headroom rather than a working limit.

---

## GitHub OAuth app

Create it at **Settings → Developer settings → OAuth Apps**.

| Field | Value |
| --- | --- |
| Homepage URL | `<WEB_ORIGIN>` |
| Authorization callback URL | `<WEB_ORIGIN>/api/v1/auth/github/callback` |

Both are on the **web** domain. The callback is proxied to the API. Registering the API host here
is the single most likely way to break sign-in, and it fails with a GitHub
`redirect_uri_mismatch` rather than anything from RepoLens.

## DNS

Nothing to do while the Vercel-provided `*.vercel.app` and Railway-provided `*.up.railway.app`
domains are in use, which is the current setup. To move to a real domain later:

| Record | Name | Value | Where |
| --- | --- | --- | --- |
| `A` (or `ALIAS`/`ANAME` at apex) | `@` | `76.76.21.21` | Vercel, for the web app |
| `CNAME` | `www` | `cname.vercel-dns.com` | Vercel |
| `CNAME` | `api` | the Railway service's domain | Railway, only if the API needs its own host |

The API does not need a public hostname of its own for the browser — only for Vercel's rewrite to
reach it. After any domain change: update `WEB_ORIGIN` on the API, `API_INTERNAL_URL` on Vercel,
and both URLs on the GitHub OAuth app, then redeploy the API and the web app.

---

## Launch order

Each step is safe to stop at; the app is usable, in demo-only mode, from step 6.

1. **Provision Postgres.** Create the Railway project and add managed PostgreSQL.
   ```bash
   railway login
   railway link                      # select the personal repolens project
   ```

2. **Generate and set the secrets.**
   ```bash
   railway variables --service api --set TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)
   # The worker must use the same key:
   railway variables --service analyzer --set TOKEN_ENCRYPTION_KEY=<the same value>
   ```

3. **Apply the infrastructure.**
   ```bash
   pnpm install
   railway config plan                # review: 2 services, 1 database, 1 volume
   railway config apply
   ```

4. **Deploy the API and the worker.** Migrations run as the API's pre-deploy command.
   ```bash
   railway up --service api --ci
   railway up --service analyzer --ci
   railway domain --service api       # note the public URL
   curl -s https://<api-domain>/api/v1/health   # expect {"status":"ok",...}
   ```

5. **Seed the demo once**, against production:
   ```bash
   railway run --service analyzer node apps/analyzer/dist/seed-demo.js
   ```

6. **Deploy the web app.** Import the repository in Vercel with **Root Directory `apps/web`**;
   `apps/web/vercel.json` supplies the install and build commands. Set `API_INTERNAL_URL` to the
   API URL from step 4 for Production and Preview, then deploy. Verify the landing page and that
   **Explore demo** reaches a scored repository.

   > **The API must be serving before this build runs.** The landing page prerenders its demo
   > panel by fetching `API_INTERNAL_URL` during `next build`, and the fetch failure is swallowed,
   > so an unreachable API silently ships a landing page with no demo panel. It self-heals on the
   > next revalidation (120s), but the first visitors see the degraded page. This is why the API
   > is deployed in step 4 and seeded in step 5, and why CI starts the API before building the
   > web app.

7. **Enable sign-in.** Create the OAuth app with the now-known Vercel domain, then:
   ```bash
   railway variables --service api --set GITHUB_CLIENT_ID=... --set GITHUB_CLIENT_SECRET=...
   railway variables --service api --set WEB_ORIGIN=https://<vercel-domain>
   railway redeploy --service api --yes
   ```
   Update `WEB_ORIGIN` in `.railway/railway.ts` in the same change so the file stays the source
   of truth. Sign in once and confirm `/api/v1/me` returns your user.

### Repository secrets and variables

| Name | Kind | Used by |
| --- | --- | --- |
| `RAILWAY_TOKEN` | secret | `deploy.yml`, `railway-config.yml`. A **project token** scoped to the production environment. |
| `API_PUBLIC_URL` | variable | `deploy.yml`'s post-deploy health check. Optional; the step skips if unset. |

Vercel needs no repository secret — it deploys from its own Git integration.

---

## Operations

### Deploys

`ci.yml` runs on every push and pull request. `deploy.yml` runs **after CI succeeds on main** and
pushes both Railway services with `railway up`, checking out the commit CI tested rather than
whatever `main` points at by then. Neither Railway service is connected to GitHub, so this
workflow is the only path code takes to production.

Changes to `.railway/railway.ts` are planned on the pull request by `railway-config.yml`, which
prints the diff into the job summary so it is reviewed alongside the code. **Applying is manual**:

```bash
railway config plan        # read it
railway config apply       # destructive changes are marked before confirmation
```

Railway's own `railwayapp/config` action would automate the apply, but it runs `npm install` at
the repository root and npm cannot resolve this workspace's `workspace:*` dependencies, so it
fails before it plans. Infrastructure changes here are rare enough to be worth a human at the
keyboard.

Both Railway workflows skip cleanly when `RAILWAY_TOKEN` is absent, so the repository stays green
before it is connected to Railway.

### Rollback

```bash
railway deployment list --service api          # find the last good deployment
railway redeploy --service api --yes           # or roll back from the dashboard
```

Migrations are additive; rolling the API back to the previous image is safe. A rollback across a
destructive migration is not — there have been none so far.

### Backups

Railway's managed PostgreSQL takes automatic backups. Confirm in the database service's
**Backups** tab that a schedule is enabled and note the retention window; Railway's defaults
depend on plan. Restores are performed from that tab.

If the plan in use has no automatic backups, add a scheduled dump instead — a Railway cron
service running `pg_dump "$DATABASE_URL" | gzip` on a daily `cronSchedule`, writing to a volume or
object storage. Nothing in RepoLens depends on it: every analysis can be regenerated from GitHub,
so the only genuinely irreplaceable rows are `users` and `repositories`.

### Logs and errors

Both processes log JSON to stdout; Railway collects it. `railway logs --service api`.

Error reporting is opt-in: setting `SENTRY_DSN` turns it on for that process, and leaving it unset
means no SDK is initialised at all. The API reports unexpected 5xx; the web app reports
server-side errors through Next's instrumentation hooks. Browser errors are **not** captured —
`@sentry/nextjs` is the upgrade path, at the cost of a build-time plugin and a larger bundle.

### Abuse and cost

- **Requests**: `@fastify/rate-limit`, 300/minute, keyed by user id when signed in and by IP
  otherwise, with `/api/v1/health` exempt.
- **Work**: per-user caps on analyses queued or running at once (`MAX_CONCURRENT_ANALYSES`) and
  started in any rolling 24 hours (`MAX_ANALYSES_PER_DAY`). Both return `limit_exceeded` with a
  message the UI shows in a toast, including when the daily window frees up.
- The demo repository is outside both caps: its analyses have no requesting user, and the API
  refuses to start one for it.

Raise the caps once real usage is visible — they are deliberately low for a first launch.

---

## Verifying locally

The split can be reproduced end to end: the API and worker in containers, the web app outside
them with `API_INTERNAL_URL` pointing in, exactly as Vercel talks to Railway.

```bash
cp .env.example .env                  # set TOKEN_ENCRYPTION_KEY
docker compose up -d --build db migrate api analyzer
docker compose run --rm seed          # or set DEMO_* for a smaller repository

API_INTERNAL_URL=http://localhost:4000 pnpm --filter @repolens/web build
cd apps/web && API_INTERNAL_URL=http://localhost:4000 pnpm start &

pnpm test:e2e                         # includes the API-proxy suite
```

`docker compose up` also starts a `web` container if you want everything in Docker; it waits for
the API's healthcheck before starting.

### Manual checks that the automated suite does not cover

1. **Sign-in round trip.** Click sign in, authorize on GitHub, land back on `/repos`. Confirm the
   address bar never shows the API host, and that `repolens_session` in devtools is set on the web
   domain with `HttpOnly`, `Secure`, `SameSite=Lax` and **no** `Domain`.
2. **Private repository.** Add one, analyze it, and confirm a signed-out browser gets a 404 for
   `/r/<owner>/<name>` rather than a 403 — names are never confirmed to strangers.
3. **Quota message.** Start analyses until `MAX_CONCURRENT_ANALYSES` is hit and confirm the toast
   names the limit and what to do about it.
