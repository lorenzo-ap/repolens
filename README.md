# RepoLens

**Engineering intelligence for GitHub repositories.** Point it at a repository and it returns one
auditable health score, backed by findings you can act on — with the evidence, file and line for
every one.

### [→ Try the live demo](https://repolens-sepia.vercel.app) · no sign-in required

[![CI](https://github.com/lorenzo-ap/repolens/actions/workflows/ci.yml/badge.svg)](https://github.com/lorenzo-ap/repolens/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

RepoLens clones a repository and runs deterministic static analysis over the TypeScript/JavaScript
AST, the module graph, the package manifests, the lockfile and the Git history. **No LLM is
involved and repository code is never executed** — the same commit always produces the same score,
and you can trace every point of it back to a specific finding.

Sign in with GitHub to analyze your own repositories, or explore the demo, which is real output
from the same pipeline. RepoLens also [analyzes itself](https://repolens-sepia.vercel.app).

---

## What it does

| | |
| --- | --- |
| **Health score** | Seven weighted categories, with the full derivation shown in the UI — no black box |
| **Findings** | Severity, evidence, recommendation, file and line. Searchable, filterable, sortable |
| **Architecture** | Interactive import graph with cycle detection (Tarjan) at file and directory level |
| **Complexity** | Cyclomatic and cognitive complexity per function, with distributions and worst offenders |
| **Dependencies** | Lockfile hygiene, unbounded ranges, deprecated packages, registry advisories |
| **Testing** | Frameworks, test-to-source ratio, untested areas, focused and skipped tests |
| **Git history** | Bus factor, activity, churn × complexity hotspots |
| **Comparisons** | Diff two analyses: improved and regressed categories, new and resolved findings |

Analyses stream live progress per step, and findings can be turned into a GitHub issue in one click.

## How it works

```
apps/web        Next.js 16 · App Router, Tailwind 4, TanStack Query, Recharts, React Flow
apps/api        Fastify 5 · Zod contracts, Drizzle + PostgreSQL, pg-boss queue producer
apps/analyzer   Worker · hardened git fetch, analysis pipeline, result persistence
packages/analysis   Deterministic analyzers, scoring model, pipeline runner (fixture-tested)
packages/shared     Zod schemas that double as API contracts and domain types
packages/database   Drizzle schema, migrations, client, token encryption
```

Three processes and one PostgreSQL database. The job queue lives in Postgres via pg-boss, so
there's no Redis to operate. The browser only ever talks to the web origin — Next.js rewrites
`/api/v1/*` to the API — which keeps session cookies first-party and CORS out of the request path.

### What the analyzers measure

| Analyzer | Source | Examples |
| --- | --- | --- |
| Structure | file tree | languages, README/LICENSE/CI presence, lockfiles, oversized files |
| TypeScript | tsconfig + AST | strict mode, explicit `any`, `@ts-ignore`, non-null assertions, unused exports |
| Quality | AST + text | long functions, deep nesting, empty catch blocks, duplicated blocks |
| Complexity | AST | cyclomatic and cognitive complexity per function |
| Dependencies | manifests + lockfile | unbounded ranges, git/URL deps, deprecated packages, advisories |
| Architecture | import graph | cycles, fan-in/fan-out, hub modules, god files, orphans |
| Testing | manifests + AST | frameworks, test cases, test-to-source ratio, `.only` |
| Git history | `git log` | bus factor, activity, large commits, churn × complexity hotspots |

Every metric is documented in [`docs/05-analysis-engine.md`](docs/05-analysis-engine.md).

## Engineering notes

The parts that were interesting to build:

**Analyzing untrusted code safely.** Repository code is never executed — no `npm install`, no lint
plugins, no scripts. Files are read as data, and `git` runs with hooks, prompts, credential helpers
and non-HTTPS protocols disabled. Hard limits cap repository size, working-tree size, file count,
AST file size and total runtime via `AbortSignal`; fetches are shallow, into a random temp
directory that is always removed.

**Determinism as a feature.** `packages/analysis` runs the full pipeline against a fixture
repository with deliberately planted issues and asserts *exact* findings — so a scoring change is
never accidental.

**Credential handling.** GitHub tokens are encrypted at rest (AES-256-GCM) and decrypted only to
call GitHub. The server stores a SHA-256 hash of the session token, never the token. Private
repositories 404 for strangers rather than 403, so names are never confirmed. The public deployment
requests `public_repo` only — analyzing private repositories is a self-hosting capability, because
asking strangers for `repo` scope means becoming custodian of their private source.

**Running it for free.** Production is Vercel + Cloud Run + Neon on permanently-free tiers. Both
services scale to zero; the API nudges the analyzer with an OIDC token when work is queued, so an
analysis starts in seconds rather than waiting on a polling worker. Trade-offs and the full runbook
are in [`docs/06-deployment.md`](docs/06-deployment.md).

## Running locally

Requirements: Node 22+, pnpm 10, PostgreSQL 16, git.

```bash
pnpm install
cp .env.example .env            # set TOKEN_ENCRYPTION_KEY (openssl rand -hex 32)
createdb repolens
pnpm db:migrate

pnpm seed:demo                  # analyzes a real open-source repo at several tags
pnpm dev                        # web :3000 · api :4000 · analyzer worker
```

Open <http://localhost:3000> and click **Explore the demo**. Sign-in needs a GitHub OAuth app
(callback `<WEB_ORIGIN>/api/v1/auth/github/callback`); without one the app runs in demo-only mode.

> **On macOS**, run the seed through Docker instead — it shells out to GNU `du`, which BSD `du`
> rejects: `docker compose run --rm seed`

Everything at once, including the database:

```bash
docker compose up --build
```

## Quality gates

```bash
pnpm lint        # Biome
pnpm typecheck   # strict TypeScript across all packages
pnpm test        # unit + integration (needs a PostgreSQL test database)
pnpm test:e2e    # Playwright, desktop and mobile viewports
pnpm build
```

API routes are tested against a real PostgreSQL database — auth, CSRF, authorization, pagination,
quotas and comparison — and the end-to-end suite additionally asserts that the API proxy is
transparent enough for sessions to stay first-party.

## Documentation

| | |
| --- | --- |
| [`docs/01-product.md`](docs/01-product.md) | Product definition and scope |
| [`docs/02-ux.md`](docs/02-ux.md) | Flows and interaction design |
| [`docs/03-design-system.md`](docs/03-design-system.md) | Visual language and components |
| [`docs/04-architecture.md`](docs/04-architecture.md) | Architecture decision records |
| [`docs/05-analysis-engine.md`](docs/05-analysis-engine.md) | Every metric and how it is scored |
| [`docs/06-deployment.md`](docs/06-deployment.md) | Production runbook |

## License

MIT
