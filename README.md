# RepoLens

Engineering intelligence for GitHub repositories. RepoLens clones a repository, runs deterministic
static analysis on the TypeScript/JavaScript AST, the module graph, the package manifests, the
lockfile and the Git history, and turns the result into one auditable health score with findings
you can act on. No AI API is required; the analysis never executes code from the repository.

- **Health score** with seven category scores and a fully inspectable derivation.
- **Findings** with severity, evidence, recommendation, file and line, searchable and filterable.
- **Architecture** as an interactive import graph with cycle detection at directory and file level.
- **Dependencies, Testing, Complexity and Git history** pages, each a focused view over the same
  metrics document: tables, distributions and hotspots with links into the findings list.
- **Analyses** with a score trend and a comparison of two analyses: improved, regressed and
  unchanged categories, new and resolved findings, metric deltas.
- **Live progress** for each analysis step, with timings.
- **GitHub integration**: OAuth sign-in, private repositories, issue creation from a finding.
- **Public demo** produced by the same pipeline, analyzing a real open-source repository at
  several historical commits.

## Architecture

```
apps/web        Next.js 16 app (App Router, Tailwind 4, TanStack Query, Recharts, React Flow)
apps/api        Fastify 5 API (Zod contracts, Drizzle + PostgreSQL, pg-boss queue producer)
apps/analyzer   Worker: hardened git fetch, analysis pipeline, result persistence, demo seed
packages/shared    Zod schemas that double as API contracts and domain types
packages/database  Drizzle schema, migrations, client, token encryption
packages/analysis  Deterministic analyzers, scoring model, pipeline runner (fixture-tested)
packages/config    Shared TypeScript configuration
docs/              Product, UX, design-system, architecture (ADRs), analysis-engine and deployment
```

Three processes (web, api, analyzer) and one PostgreSQL database. The job queue runs in PostgreSQL
through pg-boss, so there is no Redis to operate. See `docs/04-architecture.md` for the ADRs.

### What the analyzers measure

| Analyzer | Source | Examples |
| --- | --- | --- |
| Structure | file tree | languages, README/LICENSE/CI presence, lockfiles, oversized files |
| TypeScript | tsconfig + AST | strict mode, explicit `any`, `@ts-ignore`, non-null assertions, unused exports |
| Quality | AST + text | long functions, deep nesting, empty catch blocks, duplicated blocks, linter setup |
| Complexity | AST | cyclomatic and cognitive complexity per function, distribution, top functions |
| Dependencies | manifests + lockfile | unbounded ranges, git/URL deps, deprecated packages, registry advisories |
| Architecture | import graph | cycles (Tarjan), fan-in/fan-out, hub modules, god files, orphans |
| Testing | manifests + AST | frameworks, test cases, test-to-source ratio, untested areas, `.only` |
| Git history | `git log` | bus factor, activity, large commits, churn × complexity hotspots |

Every metric is documented in `docs/05-analysis-engine.md`. The scoring inputs and weights are shown
in the UI next to the score ("How is this computed?").

## Running locally

Requirements: Node 22+, pnpm 10, PostgreSQL 16, git.

```bash
pnpm install
cp .env.example .env            # fill in TOKEN_ENCRYPTION_KEY (openssl rand -hex 32)
createdb repolens               # or use docker compose up db
pnpm db:migrate                 # applies packages/database/drizzle/*.sql

pnpm seed:demo                  # analyzes the demo repository (honojs/hono at 4 tags by default)
pnpm dev                        # web :3000, api :4000, analyzer worker
```

Open http://localhost:3000 and click **Explore the demo**. Sign-in requires a GitHub OAuth app
(callback URL `<WEB_ORIGIN>/api/v1/auth/github/callback` — the browser stays on the web origin and
the request is proxied to the API) configured through `GITHUB_CLIENT_ID` and
`GITHUB_CLIENT_SECRET`; without it the app runs in demo-only mode.

### Docker

```bash
docker compose up --build       # db, migrations, api, analyzer, web, demo seed
```

## Quality gates

```bash
pnpm typecheck                  # strict TypeScript across all packages
pnpm lint                       # Biome (lint + format)
pnpm test                       # unit + integration tests (needs a PostgreSQL test database)
pnpm test:e2e                   # Playwright against a running, seeded stack
pnpm build
```

Tests: `packages/analysis` runs the full pipeline against a fixture repository with deliberately
planted issues and asserts exact findings and determinism; `apps/api` runs route tests against a
real PostgreSQL database (auth, CSRF, authorization, pagination, comparison, issue creation);
`apps/analyzer` covers persistence and failure handling; `apps/web/e2e` drives the demo in a
browser on desktop and mobile viewports.

## Security model

- Repository code is never executed: no `npm install`, no lint plugins, no scripts. Files are read
  as data; `git` runs with hooks, prompts, credential helpers and non-HTTPS protocols disabled.
- Hard limits: repository size (GitHub `size`), working tree size after fetch, file count, single
  file size for AST parsing, fetch timeout and an overall analysis timeout enforced via
  `AbortSignal`. Fetches are shallow (400 commits, no tags) into a random temp directory that is
  always removed.
- GitHub tokens are encrypted at rest (AES-256-GCM) and only decrypted to talk to GitHub. Session
  cookies are `HttpOnly; SameSite=Lax`, the server stores only a SHA-256 hash of the token, and
  state-changing requests must carry a trusted `Origin`.
- Private repositories are only readable by the account that added them; lookups by strangers
  return 404 so names are never confirmed. The demo repository is read-only for everyone.
- All input is validated with Zod; rate limiting is enabled on the API; security headers are set by
  helmet (API) and Next.js headers (web).

## Configuration

See `.env.example`. Notable variables: `LIMITS` live in `packages/shared/src/limits.ts`;
`ANALYZER_NETWORK=false` disables the npm advisory lookup for offline environments;
`DEMO_REPO_OWNER`/`DEMO_REPO_NAME`/`DEMO_COMMITS` choose what the seed analyzes.

## Deployment

`docs/06-deployment.md` is the runbook: the Vercel + Railway split, every environment variable per
service, the GitHub OAuth app settings, DNS, and the launch order.

## License

MIT
