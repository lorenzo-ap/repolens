# RepoLens — Architecture

_Phase 4 output (Software Architect)._ Decisions are recorded as ADRs at the bottom.

## Topology

```
apps/
  web/        Next.js 16 (App Router). Talks only to the API over HTTP. No DB access.
  api/        Fastify 5. Auth, GitHub integration, repositories, analyses, findings, metrics,
              architecture, history, issue creation. Enqueues analysis jobs.
  analyzer/   Worker process. Consumes jobs, clones repositories into an isolated temp dir,
              runs the analysis pipeline from packages/analysis, persists results, reports progress.
packages/
  shared/     Zod schemas = API contracts + domain types shared by web, api, analyzer.
  database/   Drizzle schema, migrations, typed client factory.
  analysis/   Pure, deterministic analyzers and the scoring model. No DB, no network, no process spawn
              except `git` (read-only metadata commands). Fully unit-testable against fixtures.
  config/     Shared tsconfig bases and Biome configuration.
fixtures/     Small repositories used by analyzer tests (committed as plain directories).
```

Three deployable processes: `web`, `api`, `analyzer`. One database: PostgreSQL. The queue lives in
PostgreSQL (pg-boss); see ADR-2.

## Service boundaries

- **web** never imports from `database` or `analysis`; it depends on `shared` for contracts only.
- **api** owns all reads/writes to the database on behalf of users and all GitHub API calls.
- **analyzer** owns cloning and analysis. It writes analysis results and step progress; it never
  touches user/session tables. It reads a short-lived, scoped clone token passed in the job payload
  for private repositories (never persisted in the job table unencrypted; see Authentication).
- **analysis** knows nothing about persistence; it takes a path and returns typed results.

## Domain model

```
User            id, githubId, login, name, avatarUrl, createdAt
Session         id (random 256-bit), userId, encryptedGithubToken, scopes, expiresAt, createdAt
Repository      id, ownerUserId?, githubId?, owner, name, fullName, defaultBranch, isPrivate,
                isDemo, sizeKb, primaryLanguage, htmlUrl, createdAt, updatedAt
Analysis        id, repositoryId, status (queued|running|completed|failed|cancelled),
                commitSha, commitDate, branch, requestedByUserId?, startedAt, finishedAt,
                durationMs, error?, healthScore?, grade?, categoryScores (jsonb), metrics (jsonb),
                summary (jsonb: counts by severity/category), analyzerVersion, createdAt
AnalysisStep    id, analysisId, key, label, status, startedAt, finishedAt, durationMs, detail?, error?
Finding         id, analysisId, ruleId, category, severity, title, message, filePath?, line?,
                endLine?, evidence (jsonb), recommendation, fingerprint (stable across analyses),
                githubIssueUrl?
ModuleNode      id, analysisId, path, kind (dir|file), loc, fileCount, fanIn, fanOut, instability,
                findingCount, parentPath?
ModuleEdge      id, analysisId, fromPath, toPath, weight (import count)
Cycle           id, analysisId, paths (jsonb array), length
Hotspot         (derived; stored in Analysis.metrics.gitHistory.hotspots)
```

`fingerprint = sha1(ruleId + normalizedFilePath + symbolName|lineBucket)` enables "new / resolved /
unchanged" comparison across analyses without depending on exact line numbers.

## API contracts (`/api/v1`, JSON, Zod-validated both directions)

```
GET    /health
GET    /auth/github                     → 302 to GitHub (state cookie, PKCE not offered by GitHub; state suffices)
GET    /auth/github/callback            → sets session cookie, 302 to /repos
POST   /auth/logout
GET    /me                              → user | null
GET    /github/repos?q=&page=           → GitHub repositories with local analysis status
POST   /repositories                    { owner, name }  → Repository (creates or returns existing)
GET    /repositories/:owner/:name       → Repository + latestAnalysis summary
DELETE /repositories/:owner/:name
POST   /repositories/:owner/:name/analyses            → Analysis (202); dedupes active analysis
GET    /repositories/:owner/:name/analyses?limit=      → Analysis[] (summaries)
GET    /analyses/:id                                   → Analysis + steps
GET    /analyses/:id/findings?severity=&category=&path=&q=&sort=&cursor=&limit=
GET    /analyses/:id/findings/:findingId
POST   /analyses/:id/findings/:findingId/issue         → { url }   (owner only, not demo)
GET    /analyses/:id/metrics                           → full metrics document
GET    /analyses/:id/architecture?level=dir|file&root=  → nodes, edges, cycles
GET    /analyses/:id/history                           → git history metrics (hotspots, authors, churn)
GET    /analyses/:id/compare/:otherId                   → score deltas, findings new/resolved/unchanged, metric deltas
GET    /demo                                           → demo repository + latest analysis
```

Errors: `{ error: { code, message, requestId, details? } }`. Codes are stable strings
(`unauthorized`, `forbidden`, `not_found`, `validation_failed`, `rate_limited`, `github_error`,
`conflict`, `internal`). Every response carries `x-request-id`.

Pagination: cursor-based for findings (`(severityRank, id)` keyset), limit ≤ 200.

## Analysis pipeline and job flow

1. `POST /analyses` → api validates ownership, checks `sizeKb ≤ MAX_REPO_SIZE_KB`, inserts
   `Analysis(queued)` + pre-created steps, enqueues job `{ analysisId }` with pg-boss (retry 1,
   expire = ANALYSIS_TIMEOUT + 60s).
2. analyzer worker picks the job, sets `running`, resolves the clone URL (public HTTPS, or a token
   URL built from the requester's decrypted token fetched by the worker via the sessions table
   through a narrow `getCloneCredential(analysisId)` query; the token is never logged).
3. `git clone --depth 400 --single-branch --no-tags` into `os.tmpdir()/repolens/<random>` with
   `execFile` (no shell), hooks disabled, terminal prompts disabled, 120s timeout. After clone: size
   check (`du`), file count check.
4. Pipeline runs analyzers in order; each wraps in `runStep` which records start/finish/duration/detail,
   catches errors, marks the step `failed`, and continues where the analyzer is non-critical
   (dependencies audit, git history) or aborts where it is critical (structure, clone).
5. Scoring computes category scores and health score from the metrics document.
6. Results persisted in one transaction: analysis row, findings (batched inserts), module graph.
7. Temp dir removed in `finally`. Overall wall-clock guard via `AbortSignal.timeout(ANALYSIS_TIMEOUT_MS)`.

Progress is read by the web app by polling `GET /analyses/:id` (1.5s) while status is active.

## Authentication and authorization

- GitHub OAuth web flow. Requested scopes: `read:user`, `repo` (needed to list and clone private
  repositories and to create issues). Scopes are shown to the user in Settings.
- Session id is a 32-byte random value stored in an `httpOnly; Secure; SameSite=Lax` cookie; the
  server stores only its SHA-256 hash. Sessions expire after 30 days.
- GitHub access tokens are encrypted at rest with AES-256-GCM using `TOKEN_ENCRYPTION_KEY`.
- Authorization is enforced in the service layer: a repository is readable by its owner or by anyone
  if `isDemo`. Mutations (analyze, delete, create issue) require the owner and are refused on demo
  repositories. Findings/analyses inherit the repository's rule.
- CSRF: state-changing routes require `Origin`/`Referer` to match `WEB_ORIGIN` and use `SameSite=Lax`.

## Caching

- TanStack Query caches on the client; analysis data is immutable once completed so `staleTime` is
  infinite for completed analyses and short for active ones.
- The API sets `Cache-Control: private, max-age=0` by default and `public, max-age=300` for demo
  analysis responses.
- No server cache layer; queries are indexed (see schema) and results are already precomputed.

## Error handling

- Zod validation errors → 400 `validation_failed` with flattened issues.
- Domain errors are typed (`NotFoundError`, `ForbiddenError`, `ConflictError`, `GitHubError`) and
  mapped centrally in the Fastify error handler. Unknown errors → 500 with request id and full log.
- Analyzer step failures are persisted with the error message; the analysis fails only when a
  critical step fails. Timeouts and limits produce user-readable reasons.

## Observability

- pino structured logs with `requestId`, `userId`, `analysisId` bindings.
- `GET /health` reports database and queue reachability.
- Every analysis stores per-step durations; the History page exposes total duration.

## ADRs

**ADR-1: Drizzle over Prisma.** Drizzle keeps SQL visible, has no engine binary, works with `postgres`
driver and makes keyset pagination and jsonb queries straightforward. Migrations are plain SQL.

**ADR-2: pg-boss (PostgreSQL) instead of Redis/BullMQ for the job queue.** The queue carries a handful
of long-running jobs per minute at most. pg-boss gives retries, expiry, and archiving with the database
we already run, so the deployment is two stateless services plus PostgreSQL. Redis would add an
operational dependency without a workload that needs it. Rate limiting uses the in-memory store; if
the API is ever scaled horizontally, that is the one component that would justify Redis.

**ADR-3: Polling for progress instead of WebSockets/SSE.** Analyses are minute-scale; a 1.5s poll on
a small JSON document is cheaper to build and operate than a push channel, works through any proxy,
and needs no connection state in the API.

**ADR-4: Analyzer results are precomputed and stored, not computed on read.** The dashboard, findings
and graph are reads of immutable rows. This keeps API latency flat regardless of repository size.

**ADR-5: TypeScript 5.9 and the TypeScript Compiler API via ts-morph.** ts-morph bundles a compatible
compiler and gives a stable navigation API for the AST analyzers. TypeScript 7 (native) is not used
because its JavaScript API surface differs and the ecosystem tooling used here targets 5.x.

**ADR-6: No execution of repository code.** No `npm install`, no running the repository's ESLint
config or scripts. Lint configuration is read as data. `npm audit` is performed by posting the
lockfile-derived dependency list to the registry's bulk advisory endpoint, which requires no
installation; it is optional and skipped without network.

**ADR-7: Demo data is produced by the real pipeline.** The seed clones a real public repository and
analyzes it at several commits (tags are resolved to SHAs). Nothing in the demo is hand-written.

**ADR-8: Workspace packages are inlined at build time.** `@repolens/*` packages are published as
TypeScript source and bundled into each service with esbuild (`packages/config/esbuild-node.mjs`);
only the app's declared runtime dependencies stay external. The web app uses Next's
`transpilePackages`. This keeps one source of truth for contracts without a publish step.

**ADR-9: Browser talks to the API through the web origin.** Next.js rewrites `/api/v1/*` to the API,
so the session cookie is first-party, CORS is not needed in the browser, and a strict CSP
(`connect-src 'self'`) applies. GitHub tokens for private clones reach the worker only through
`GIT_CONFIG_*` environment variables, never argv or URLs. Expired sessions are purged hourly.
