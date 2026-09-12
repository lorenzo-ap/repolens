# RepoLens — Analysis Engine

_Phase 5 output (Repository Analysis Engineer)._

## Contract

```ts
interface AnalyzerContext {
  rootDir: string;            // cloned repository root
  files: RepoFile[];          // enumerated by the structure analyzer, respecting limits and ignores
  project?: ts-morph Project; // created once by the TypeScript analyzer, reused by AST analyzers
  signal: AbortSignal;        // overall analysis timeout
  logger: Logger;
}

interface AnalyzerResult<M> {
  metrics: M;                 // normalized, JSON-serialisable, documented below
  findings: FindingInput[];   // ruleId, severity, category, title, message, filePath?, line?, evidence, recommendation
}
```

Analyzers are pure functions over the working tree plus read-only `git` commands. They never
execute repository code, never `require()` anything from the repository, and never follow symlinks
outside the root.

## Limits (enforced before and during analysis)

| Limit | Default | Enforced by |
| --- | --- | --- |
| Repository size (GitHub `size`) | 500 MB | api before enqueue |
| Clone timeout | 120 s | analyzer |
| Working tree size after clone | 750 MB | analyzer |
| Files considered | 20,000 | structure analyzer (stops enumerating, records `truncated`) |
| Single file parsed by AST | 1 MB | typescript analyzer (skipped, counted) |
| Total analysis wall clock | 10 min | analyzer via AbortSignal |
| Commits read for history | 400 | git analyzer (`--depth` and `-n`) |

Ignored by default: `node_modules`, `.git`, `dist`, `build`, `out`, `.next`, `coverage`, `vendor`,
minified files (`*.min.js`), lockfiles for LOC purposes, binary extensions, and everything matched by
the repository's `.gitignore` (already excluded by clone).

## Analyzers and their metrics

### 1. structure (`structure`) — language-agnostic

Metrics: `totalFiles`, `totalLines`, `byLanguage[{language, files, lines}]`, `largestFiles[]`,
`topLevelDirs[]`, `hasReadme`, `hasLicense`, `hasCi` (GitHub workflows / other CI configs),
`hasEditorConfig`, `hasDockerfile`, `monorepo` (workspaces detected), `packageManager`
(lockfile-based), `truncated`.

Findings: `structure/missing-readme` (medium), `structure/missing-license` (low),
`structure/no-ci` (medium), `structure/large-file` (files > 1,000 lines, low; > 2,500 medium),
`structure/mixed-lockfiles` (medium).

### 2. typescript (`typescript`) — TS/JS via ts-morph

Builds a `Project` with `skipAddingFilesFromTsConfig`, `skipFileDependencyResolution: true`, our own
compiler options (`allowJs`, `jsx: preserve`), adding source files from the enumerated list.
tsconfig files are read as JSON for `strict`, `noImplicitAny`, `strictNullChecks`, `paths`,
`baseUrl` only.

Metrics: `tsFiles`, `jsFiles`, `strictMode` (from tsconfig), `anyCount` (explicit `any` annotations),
`tsIgnoreCount`, `tsExpectErrorCount`, `nonNullAssertionCount`, `typeAssertionCount` (`as X`,
excluding `as const`), `enumCount`, `exportedSymbols`, `unusedExports` (exported declarations never
imported within the repository, excluding package entry points and files matching common public
patterns like `index.ts` at package roots).

Findings: `ts/strict-disabled` (high), `ts/explicit-any` (low; aggregated per file above 3),
`ts/ts-ignore` (medium per occurrence), `ts/non-null-assertion-density` (low per file above 5),
`ts/unused-export` (low, capped at 50 findings).

### 3. quality (`quality`) — AST + text

Metrics: `todoCount`, `fixmeCount`, `consoleLogCount`, `longFunctions` (> 60 statements-lines),
`longParameterLists` (> 5 params), `deepNesting` (> 4), `emptyCatchBlocks`, `duplicateBlocks`
(exact-match rolling hash over 6-line windows, normalised whitespace, across files),
`lintConfig` (eslint | biome | none, read as data), `formatterConfig` (prettier | biome | none),
`commentedOutCodeBlocks` (heuristic: ≥ 3 consecutive comment lines ending with `;` or `{`/`}`).

Findings: `quality/long-function` (medium), `quality/too-many-params` (low),
`quality/deep-nesting` (medium), `quality/empty-catch` (high), `quality/duplicate-block` (medium),
`quality/no-linter` (medium), `quality/console-log` (low aggregated per file),
`quality/fixme` (low, per occurrence).

### 4. complexity (`complexity`) — AST

Per function (including methods, arrows assigned to declarations, class methods):
**cyclomatic complexity** = 1 + (if, else-if, for, for-in, for-of, while, do, case, catch, `&&`,
`||`, `??`, ternary, optional chaining counts 0). **Cognitive complexity** per SonarSource's public
definition (nesting increments for nested control flow, +1 per break in linear flow, +nesting for
nested structures, sequences of same logical operator count once).

Metrics: `functions`, `avgCyclomatic`, `p90Cyclomatic`, `maxCyclomatic`, `avgCognitive`,
`p90Cognitive`, `maxCognitive`, `topFunctions[{file, name, line, cyclomatic, cognitive, loc}]`
(top 25), `fileComplexity[{file, sumCyclomatic, functions}]`, `distribution` (buckets 1–5, 6–10,
11–20, 21–50, 51+).

Findings: `complexity/high-cyclomatic` (medium > 15, high > 30), `complexity/high-cognitive`
(medium > 20, high > 40).

### 5. dependencies (`dependencies`) — manifests + lockfiles

Reads every `package.json` in the working tree (excluding ignored dirs) and the root lockfile
(`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock` v1/berry, `bun.lock` text). Never installs.

Metrics: `manifests`, `direct` (prod), `directDev`, `lockfilePresent`, `lockfileType`,
`resolvedPackages` (distinct name@version in lockfile), `duplicateVersions[{name, versions[]}]`,
`unpinnedRanges` (`*`, `latest`, `>=`), `gitOrUrlDeps`, `deprecatedPatterns` (known replaced packages
list, e.g. `request`, `moment`), `workspacePackages`, `engines`, `vulnerabilities` (from the npm bulk
advisory endpoint: counts by severity and the top advisories; `null` when the network is unavailable
so the UI shows "not checked" rather than zero).

Findings: `deps/no-lockfile` (high), `deps/duplicate-versions` (low per package above 2 versions),
`deps/wildcard-range` (medium), `deps/git-url-dependency` (medium), `deps/deprecated-package` (low),
`deps/vulnerability` (severity from advisory), `deps/heavy-direct-dependencies` (info when > 80).

### 6. architecture (`architecture`) — module graph

Resolves relative imports, `paths` aliases and workspace package names to files; ignores bare
external imports (counted as external edges per module). Builds a file graph, then aggregates to a
directory graph at depth 2 (configurable). Detects strongly connected components (Tarjan) for
cycles. Computes fan-in, fan-out, instability `I = out / (in + out)`, and identifies hub modules
(fan-in in the top 5%).

Metrics: `fileNodes`, `fileEdges`, `dirNodes`, `dirEdges`, `cycles[{paths, length}]` (top 50 by
length), `cycleFileCount`, `hubs[{path, fanIn}]`, `layering` (share of edges that point "upward"
from a leaf directory to a parent, indicates layering discipline), `orphanFiles` (no imports in
either direction, excluding entry points/configs/tests).

Findings: `arch/circular-dependency` (high for cycles ≥ 3 files, medium for 2), `arch/hub-module`
(medium), `arch/god-file` (file with fan-out > 40, medium), `arch/orphan-file` (info, capped).

### 7. testing (`testing`)

Detects frameworks from manifests and files (vitest, jest, mocha, playwright, cypress, node:test).
Test files: `*.test.*`, `*.spec.*`, `__tests__/**`, `e2e/**`, `tests/**`.

Metrics: `frameworks[]`, `testFiles`, `testLines`, `sourceFiles`, `sourceLines`,
`testToSourceRatio`, `testCases` (count of `it(`/`test(` calls via AST), `skippedTests`
(`.skip`, `xit`), `onlyTests` (`.only` committed), `sourceDirsWithoutTests[]` (top-level source
directories having zero test files anywhere below them), `hasCoverageConfig`, `e2ePresent`.

Findings: `testing/no-tests` (critical), `testing/low-ratio` (high < 0.1, medium < 0.25),
`testing/only-committed` (high), `testing/skipped-tests` (low aggregated), `testing/untested-area`
(medium per directory).

### 8. git-history (`gitHistory`) — `git log`

Reads up to 400 commits: `git log --numstat --format=...`. Metrics: `commits`, `firstCommit`,
`lastCommit`, `activeDays`, `authors[{name, commits, share}]` (emails hashed, not stored),
`busFactor` (min authors covering 50% of commits), `commitsPerWeek[]` (last 26 weeks),
`churn[{file, commits, added, deleted}]` (top 50), `hotspots[{file, commits, complexity, score}]`
(files in both churn top-N and complexity top-N; `score = normalizedChurn × normalizedComplexity`),
`mergeCommitShare`, `avgCommitSize`, `largeCommits` (> 1,000 lines).

Findings: `git/hotspot` (high for top 5 hotspots), `git/bus-factor` (high when 1, medium when 2),
`git/stale` (medium when last commit > 180 days), `git/large-commits` (low).

## Scoring

Each category maps its metrics to 0–100 with explicit, monotonic transforms (documented in code
next to the transform); the base score is points earned over points available. Findings subtract
a penalty per severity (critical 10, high 4, medium 1.5, low 0.5, info 0), but only for rules whose
signal is not already one of the category's inputs (hotspots, hub modules, FIXMEs, parameter
counts, non-null density, mixed lockfiles, invalid manifests, no tests). Counting a long function
both as a density input and as a finding would double-penalise it. The penalty is divided by
`max(1, sourceFiles / 50)` so large codebases are not punished for size alone, and capped at 20
points per category.

Health score = weighted mean: quality 20, complexity 15, architecture 15, dependencies 15,
testing 20, maintainability 10 (derived: file size distribution, duplication, TODO density),
gitHealth 5. Grade: A ≥ 90, B ≥ 80, C ≥ 65, D ≥ 50, F otherwise.

All inputs to every score are stored in `analysis.metrics.scoring` so the UI can show the exact
derivation.

## Determinism

Same commit + same analyzer version → identical metrics and findings (network-dependent
vulnerability checks are the only exception and are labelled). Analyzer version is stored on the
analysis; fixture-based tests assert exact outputs.
