# RepoLens — Product Definition

_Phase 1 output (Product Manager)._

## One-line

RepoLens analyzes a GitHub repository with deterministic static analysis and turns the result into a
health score, ranked findings, an architecture map and a history trend a developer can act on in minutes.

## Target user

**Primary:** an individual engineer or tech lead who owns or is joining a TypeScript/JavaScript codebase
and needs to answer "how healthy is this, and where should I look first?" without reading every file.

**Secondary:** a hiring manager or CTO evaluating the author's engineering judgement through this
project itself. This user must be able to explore a realistic analysis without signing in.

## Core problem

Code health is invisible until it hurts. Existing signals are scattered across linters, CI, package
managers and Git. Nobody aggregates them into an honest, prioritized picture that says *what* is wrong,
*where*, *how bad* and *what to do*. Tools that try are either expensive, AI-only (and hallucinate), or
require executing the project's own build.

## Non-negotiables

- Analysis is deterministic and works without any AI API.
- Analysis never executes code from the analyzed repository.
- Every number shown is computed from the repository. No invented or "illustrative" metrics.
- Findings say where (file, line), why (evidence) and what to do (recommendation).

## Primary user journeys

1. **Explore the demo (no auth).** Land → "Explore demo" → dashboard of a real repository → drill into
   findings, architecture, history. Time to first insight: under 30 seconds.
2. **Analyze my repository.** Land → sign in with GitHub → pick a repository → start analysis →
   watch real progress (clone, per-analyzer steps) → dashboard.
3. **Triage findings.** Dashboard → Findings → filter by severity/category/file → open a finding →
   read evidence and recommendation → create a GitHub issue from it.
4. **Understand structure.** Dashboard → Architecture → interactive module graph → spot cycles and
   hub modules → jump to related findings.
5. **Track change.** Re-run analysis after changes → History → compare two analyses → see which
   scores and findings moved.

## MVP scope (must ship)

- GitHub OAuth sign-in; repository list from GitHub with search.
- Analysis pipeline with these analyzers: structure, TypeScript, code quality, complexity,
  dependencies, architecture, testing, Git history.
- Health score + category scores with a documented, inspectable formula.
- Dashboard, Findings (search/filter/sort/detail), Architecture graph, History comparison.
- Live progress with per-step status and timings.
- GitHub issue creation from a finding.
- Public demo repository with several analyses at different points in its history.
- Size limits, timeouts, and safe cloning.

## Explicitly not in MVP

- Languages other than TypeScript/JavaScript (structure and Git analyzers are language-agnostic;
  AST analyzers are TS/JS only and the UI says so).
- Org/team accounts, billing, roles.
- PR-level analysis or GitHub App checks.
- AI explanations (design allows an optional layer; it is not built into the core).
- Scheduled re-analysis.

## Information architecture

```
/                       Landing: what it is, demo entry, sign-in
/demo                   Redirect to the demo repository dashboard
/repos                  Repository picker (authenticated)
/r/:owner/:name         Dashboard for the latest completed analysis
/r/:owner/:name/findings
/r/:owner/:name/architecture
/r/:owner/:name/history
/r/:owner/:name/analyses/:id   Progress view while running; redirects to dashboard when complete
/settings               Session and data controls (sign out, delete data)
```

Every repository page accepts `?analysis=<id>` to view an older analysis. The header always shows
which analysis (commit, date) is being viewed and whether it is the latest.

## Health score model (summary; details in `05-analysis-engine.md`)

Seven category scores (0–100), each derived from concrete metrics. The overall health score is a
weighted mean. Weights and every intermediate value are exposed in the API and in the UI's "How is
this computed?" panel so the number is auditable rather than magical.

## Demo experience

The demo repository is a real open-source TypeScript project cloned and analyzed by the real
pipeline at three historical commits, so history and trends are genuine. Demo data is labelled with a
persistent "Demo" badge and cannot be re-analyzed or have issues created from it by anonymous users.

## Success criteria

- A first-time visitor understands what RepoLens does within one screen and reaches a real insight in
  under a minute.
- An engineer can run an analysis on a mid-sized repository (~2,000 files) in under two minutes.
- Every finding is reproducible from the repository contents at the analyzed commit.
