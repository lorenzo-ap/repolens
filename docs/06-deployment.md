# RepoLens — Deployment

_What runs where, what each piece needs, and how to change it. Describes the live deployment._

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
                     │  Google Cloud Run — repolens-api         │
                     │  us-central1, scales to zero             │
                     └─────────────────────────────────────┬────┘
                                                           │ TLS
                     ┌─────────────────────────────────────▼────┐
                     │  Neon — PostgreSQL 18, us-east-1         │
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

## What is deliberately not deployed

**The analyzer worker.** It is a long-running pg-boss consumer, and no free tier will run an
always-on background process. Without it:

- Every public page works. The demo's analyses are real output from the real pipeline, seeded
  once into production (below).
- **Sign-in is switched off** by leaving `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` unset. This
  is a supported mode — the API logs `sign-in is disabled, demo mode only`. That is deliberate:
  with no worker, a signed-in user could queue an analysis that would never run, which is worse
  than not offering it at all.

To enable the full product, run the worker anywhere that allows a persistent process (a Cloud Run
service with `--min-instances 1`, a small VM, a container host) against the same `DATABASE_URL`
and `TOKEN_ENCRYPTION_KEY`, then set the two GitHub variables on the API.

## Why the image is built by Cloud Build

`gcloud run deploy --source` builds a Dockerfile's **final stage**, which here is `web`. Cloud
Build runs `docker build` directly, so `deploy/cloudrun/cloudbuild.yaml` can select
`--target api` and reuse the existing stage unchanged. It also sets `DOCKER_BUILDKIT=1`, without
which the `RUN --mount=type=cache` line for the pnpm store is rejected by the legacy builder.

---

## Environment variables

Secrets are marked ⚠. Never commit them.

### Vercel — `apps/web`

| Variable | Value | Scope |
| --- | --- | --- |
| `API_INTERNAL_URL` | the Cloud Run service URL, no trailing slash | Production + Preview |
| `SENTRY_DSN` ⚠ | optional; unset means no SDK is initialised | Production |

`API_INTERNAL_URL` is read **at build time** (it is baked into the rewrite) and at runtime by
server components. Changing it requires a redeploy, not just a restart.

Project settings: **Root Directory `apps/web`**, Node 22.x. The install and build commands come
from `apps/web/vercel.json` and both `cd ../..` so the workspace builds from the repository root.

### Cloud Run — `repolens-api`

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `API_PORT` | `8080`, matching the container port Cloud Run routes to |
| `WEB_ORIGIN` | the Vercel domain, exactly as the browser sees it |
| `API_ORIGIN` | the Cloud Run URL — CSRF allow-list only |
| `TRUST_PROXY` | `true`; Cloud Run terminates TLS, so client IPs arrive in `X-Forwarded-For` |
| `SESSION_COOKIE_NAME` | `repolens_session` |
| `DATABASE_URL` ⚠ | Neon connection string |
| `TOKEN_ENCRYPTION_KEY` ⚠ | 64 hex chars, `openssl rand -hex 32` |
| `MAX_CONCURRENT_ANALYSES` | `2` |
| `MAX_ANALYSES_PER_DAY` | `25` |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` ⚠ | **unset** — see "not deployed" above |

Service settings: `--memory 512Mi --cpu 1 --min-instances 0 --max-instances 3 --timeout 60`.
`min-instances 0` is what keeps it inside the always-free tier; the cost is a cold start of
roughly 1–3s after an idle period. `max-instances 3` is the spend guard.

### Neon

Use the **direct** (non-pooled) host, not the `-pooler` one: pg-boss holds long-lived
connections and expects a real session, which a transaction pooler does not provide.

---

## Cost

Everything is inside a permanently free tier, but billing is enabled on the Google Cloud project,
so the free tier is a quota rather than a hard wall.

| Piece | Free allowance | This app |
| --- | --- | --- |
| Cloud Run | 2M requests, 180k vCPU-seconds, 360k GiB-seconds per month | a rounding error |
| Cloud Build | 120 build-minutes per day | ~3 minutes per API deploy |
| Artifact Registry | 0.5 GB | ~1 GB per image — **the one real limit** |
| Neon | 0.5 GB storage | demo data is a few MB |
| Vercel Hobby | 100 GB bandwidth | fine |

The API image is about 1 GB because every stage copies the whole root `node_modules`. Artifact
Registry's free tier is 0.5 GB, so **keeping more than one image version will cost a few cents a
month**. Delete old tags after a deploy:

```bash
gcloud artifacts docker images list us-central1-docker.pkg.dev/$PROJECT/repolens/api --include-tags
gcloud artifacts docker images delete us-central1-docker.pkg.dev/$PROJECT/repolens/api:<old-sha> --quiet
```

Set a budget alert on the billing account regardless.

---

## Routine changes

### Web

Push to `main`. Vercel builds from Git. Nothing else to do.

### API

Automated on push to `main` by `.github/workflows/deploy.yml` once the repository variables below
exist. By hand:

```bash
gcloud builds submit --config deploy/cloudrun/cloudbuild.yaml \
  --substitutions=SHORT_SHA=$(git rev-parse --short HEAD) .
gcloud run deploy repolens-api --region us-central1 \
  --image us-central1-docker.pkg.dev/$PROJECT/repolens/api:$(git rev-parse --short HEAD)
```

### Changing a variable

```bash
gcloud run services update repolens-api --region us-central1 \
  --update-env-vars WEB_ORIGIN=https://example.vercel.app
```

### Rolling back

```bash
gcloud run revisions list --service repolens-api --region us-central1
gcloud run services update-traffic repolens-api --region us-central1 --to-revisions <revision>=100
```

Migrations are additive, so rolling the image back is safe.

---

## One-time setup

Assumes the `gcloud`, `neonctl` and `vercel` CLIs, all authenticated.

1. **Google Cloud project**

   ```bash
   gcloud projects create repolens-xxxxxx --name=RepoLens
   gcloud config set project repolens-xxxxxx
   gcloud billing projects link repolens-xxxxxx --billing-account=<ID>
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
   gcloud artifacts repositories create repolens --repository-format=docker --location=us-central1
   ```

2. **Neon database**

   ```bash
   neonctl projects create --name repolens --region-id aws-us-east-1 --org-id <org>
   ```

3. **Schema and demo data.** Migrations run from anywhere. The seed **must run on Linux** — the
   analyzer shells out to `du --exclude`, which is GNU-only and fails on macOS:

   ```bash
   DATABASE_URL=<neon-url> pnpm db:migrate
   docker build --target analyzer -t repolens-analyzer .
   docker run --rm -e DATABASE_URL=<neon-url> \
     -e DEMO_REPO_OWNER=vercel -e DEMO_REPO_NAME=swr -e DEMO_COMMITS=v2.2.0,v2.3.0,v2.5.1 \
     repolens-analyzer node apps/analyzer/dist/seed-demo.js
   ```

4. **Deploy the API** (see "Routine changes"), then note the service URL.

5. **Vercel.** `vercel link --cwd apps/web --project repolens` creates the project and connects
   the GitHub repository. The CLI leaves **Root Directory as `.`**, which breaks the `cd ../..`
   in the build command — set it to `apps/web` explicitly (dashboard, or `PATCH /v9/projects/{id}`
   with `{"rootDirectory":"apps/web","nodeVersion":"22.x"}`). Then set `API_INTERNAL_URL` for
   Production and Preview and push to `main`.

6. **Close the loop.** Set `WEB_ORIGIN` on Cloud Run to the Vercel domain — until then the API
   rejects state-changing requests from the web app.

   > The web build fetches `API_INTERNAL_URL` while prerendering the landing page's demo panel,
   > and swallows the failure. Deploy and seed the API **before** building the web app, or the
   > landing page ships without its demo panel until the next revalidation (120s).

### Automated API deploys

`deploy.yml` uses Workload Identity Federation, so no service-account key is stored. One-time:

```bash
gcloud iam service-accounts create github-deployer
gcloud iam workload-identity-pools create github --location=global
gcloud iam workload-identity-pools providers create-oidc github \
  --location=global --workload-identity-pool=github \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping=google.subject=assertion.sub,attribute.repository=assertion.repository \
  --attribute-condition='assertion.repository=="<owner>/<repo>"'
```

Grant `github-deployer` the `run.admin`, `cloudbuild.builds.editor`, `artifactregistry.writer`
and `iam.serviceAccountUser` roles, bind the pool to it with `roles/iam.workloadIdentityUser`,
then set these **repository variables** (not secrets — none are sensitive):

| Name | Value |
| --- | --- |
| `GCP_PROJECT_ID` | the project id |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/<num>/locations/global/workloadIdentityPools/github/providers/github` |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | `github-deployer@<project>.iam.gserviceaccount.com` |

The workflow skips cleanly while `GCP_WORKLOAD_IDENTITY_PROVIDER` is unset, so the repository
stays green before this is wired up.

---

## Verifying locally

The split can be reproduced end to end: API and worker in containers, the web app outside them
with `API_INTERNAL_URL` pointing in, exactly as Vercel talks to Cloud Run.

```bash
cp .env.example .env                  # set TOKEN_ENCRYPTION_KEY
docker compose up -d --build db migrate api analyzer
docker compose run --rm seed

API_INTERNAL_URL=http://localhost:4000 pnpm --filter @repolens/web build
cd apps/web && API_INTERNAL_URL=http://localhost:4000 pnpm start &

pnpm test:e2e                         # includes the API-proxy suite
```

### Manual checks the automated suite does not cover

1. **Cold start.** Leave the site alone for an hour, then load it. First paint should be a few
   seconds, not a timeout.
2. **Private repository isolation** (needs sign-in, so only with a worker running): a signed-out
   browser must get 404 for `/r/<owner>/<name>`, not 403 — names are never confirmed.
