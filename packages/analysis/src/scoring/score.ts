import type {
  Category,
  CategoryScoreDetail,
  CategoryScores,
  FindingInput,
  MetricsDocument,
  ScoreInput,
  Scoring,
  Severity,
} from "@repolens/shared";
import { CATEGORIES } from "@repolens/shared";

export const SCORING_VERSION = "1.0.0";

export const CATEGORY_WEIGHTS: Record<Category, number> = {
  quality: 20,
  complexity: 15,
  architecture: 15,
  dependencies: 15,
  testing: 20,
  maintainability: 10,
  gitHealth: 5,
};

export const SEVERITY_PENALTY: Record<Severity, number> = {
  critical: 10,
  high: 4,
  medium: 1.5,
  low: 0.5,
  info: 0,
};

/** A category can lose at most this many points from findings volume alone. */
export const MAX_FINDING_PENALTY = 20;

/**
 * Only findings whose signal is not already one of the category's base inputs contribute to the
 * penalty; everything else would be counted twice (once as a metric, once as a finding).
 */
export const PENALIZED_RULES = new Set([
  "quality/fixme",
  "quality/too-many-params",
  "ts/non-null-assertion-density",
  "arch/hub-module",
  "git/hotspot",
  "structure/mixed-lockfiles",
  "deps/invalid-manifest",
  "testing/no-tests",
]);

/** Penalties are per 50 source files so a large codebase is not punished for its size alone. */
export const PENALTY_SIZE_UNIT = 50;

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Linear transform from a metric to points: `value <= good` earns all points, `value >= bad`
 * earns none, in between it scales linearly. Works in both directions by swapping good/bad.
 */
export function linear(value: number, good: number, bad: number, max: number): number {
  if (good === bad) return value <= good ? max : 0;
  const t = (value - good) / (bad - good);
  return round1(clamp(1 - t, 0, 1) * max);
}

function input(
  label: string,
  value: ScoreInput["value"],
  points: number,
  max: number,
  note?: string,
): ScoreInput {
  return note
    ? { label, value, points: round1(points), max, note }
    : { label, value, points: round1(points), max };
}

function baseQuality(m: MetricsDocument): ScoreInput[] {
  const q = m.quality;
  const ts = m.typescript;
  const s = m.structure;
  if (!q) return [input("Quality analyzer did not run", null, 50, 100, "Neutral score applied")];
  const sourceFiles = m.testing?.sourceFiles ?? m.structure?.totalFiles ?? 1;
  const perK = (n: number) => (n / Math.max(1, sourceFiles)) * 100; // per 100 source files
  return [
    input("Linter configured", q.lintConfig !== "none", q.lintConfig !== "none" ? 15 : 0, 15),
    input(
      "Formatter configured",
      q.formatterConfig !== "none",
      q.formatterConfig !== "none" ? 5 : 0,
      5,
    ),
    input("CI configured", s?.hasCi ?? false, s?.hasCi ? 10 : 0, 10),
    input(
      "TypeScript strict mode",
      ts?.strictMode ?? null,
      ts ? (ts.strictMode ? 15 : ts.tsFiles === 0 ? 7.5 : 0) : 7.5,
      15,
      ts && ts.tsFiles === 0 ? "No TypeScript files; half credit" : undefined,
    ),
    input(
      "Explicit any per 100 files",
      round1(perK(ts?.anyCount ?? 0)),
      linear(perK(ts?.anyCount ?? 0), 5, 60, 10),
      10,
    ),
    input("Empty catch blocks", q.emptyCatchBlocks, linear(q.emptyCatchBlocks, 0, 10, 10), 10),
    input(
      "Long functions per 100 files",
      round1(perK(q.longFunctions)),
      linear(perK(q.longFunctions), 5, 50, 15),
      15,
    ),
    input(
      "Deeply nested functions per 100 files",
      round1(perK(q.deepNesting)),
      linear(perK(q.deepNesting), 2, 25, 10),
      10,
    ),
    input("@ts-ignore count", ts?.tsIgnoreCount ?? 0, linear(ts?.tsIgnoreCount ?? 0, 0, 20, 5), 5),
    input(
      "console.log per 100 files",
      round1(perK(q.consoleLogCount)),
      linear(perK(q.consoleLogCount), 2, 40, 5),
      5,
    ),
  ];
}

function baseComplexity(m: MetricsDocument): ScoreInput[] {
  const c = m.complexity;
  if (!c) return [input("Complexity analyzer did not run", null, 50, 100, "Neutral score applied")];
  if (c.functions === 0) return [input("No functions found", 0, 70, 100, "Nothing to measure")];
  const highShare = ((c.distribution["21-50"] + c.distribution["51+"]) / c.functions) * 100;
  return [
    input("Average cyclomatic complexity", c.avgCyclomatic, linear(c.avgCyclomatic, 3, 10, 30), 30),
    input("90th percentile cyclomatic", c.p90Cyclomatic, linear(c.p90Cyclomatic, 8, 25, 25), 25),
    input("Functions above complexity 20 (%)", round1(highShare), linear(highShare, 1, 10, 25), 25),
    input("Average cognitive complexity", c.avgCognitive, linear(c.avgCognitive, 3, 15, 20), 20),
  ];
}

function baseArchitecture(m: MetricsDocument): ScoreInput[] {
  const a = m.architecture;
  if (!a)
    return [input("Architecture analyzer did not run", null, 50, 100, "Neutral score applied")];
  if (a.fileNodes === 0) return [input("No modules found", 0, 70, 100, "Nothing to measure")];
  const cycleShare = (a.cycleFileCount / a.fileNodes) * 100;
  const unresolvedShare =
    (a.unresolvedImports / Math.max(1, a.fileEdges + a.unresolvedImports)) * 100;
  return [
    input("Files involved in cycles (%)", round1(cycleShare), linear(cycleShare, 0, 25, 40), 40),
    input("Dependency cycles", a.cycleCount, linear(a.cycleCount, 0, 20, 20), 20),
    input("God files (fan-out ≥ 40)", a.godFiles.length, linear(a.godFiles.length, 0, 8, 15), 15),
    input("Average fan-out", a.avgFanOut, linear(a.avgFanOut, 4, 15, 15), 15),
    input(
      "Unresolved internal imports (%)",
      round1(unresolvedShare),
      linear(unresolvedShare, 2, 30, 10),
      10,
      "Imports that could not be mapped to a file",
    ),
  ];
}

function baseDependencies(m: MetricsDocument): ScoreInput[] {
  const d = m.dependencies;
  if (!d)
    return [input("Dependencies analyzer did not run", null, 50, 100, "Neutral score applied")];
  if (d.manifests === 0) return [input("No package.json found", 0, 70, 100, "Nothing to measure")];
  const v = d.vulnerabilities;
  const vulnPoints = v
    ? linear(v.critical * 4 + v.high * 2 + v.moderate + v.low * 0.25, 0, 20, 30)
    : 20;
  return [
    input("Lockfile committed", d.lockfilePresent, d.lockfilePresent ? 25 : 0, 25),
    input(
      "Known vulnerabilities (weighted)",
      v ? v.critical * 4 + v.high * 2 + v.moderate + v.low * 0.25 : null,
      vulnPoints,
      30,
      v ? undefined : "Advisory database not reachable; partial credit",
    ),
    input(
      "Unbounded version ranges",
      d.unpinnedRanges.length,
      linear(d.unpinnedRanges.length, 0, 10, 15),
      15,
    ),
    input(
      "Git/URL dependencies",
      d.gitOrUrlDeps.length,
      linear(d.gitOrUrlDeps.length, 0, 5, 10),
      10,
    ),
    input(
      "Deprecated packages",
      d.deprecatedPackages.length,
      linear(d.deprecatedPackages.length, 0, 6, 10),
      10,
    ),
    input(
      "Packages with 3+ versions",
      d.duplicateVersions.filter((x) => x.versions.length > 2).length,
      linear(d.duplicateVersions.filter((x) => x.versions.length > 2).length, 2, 40, 10),
      10,
    ),
  ];
}

function baseTesting(m: MetricsDocument): ScoreInput[] {
  const t = m.testing;
  if (!t) return [input("Testing analyzer did not run", null, 50, 100, "Neutral score applied")];
  if (t.sourceFiles === 0) return [input("No source files", 0, 70, 100, "Nothing to measure")];
  const areas = t.sourceDirsWithTests + t.sourceDirsWithoutTests.length;
  const areaCoverage = areas === 0 ? 100 : (t.sourceDirsWithTests / areas) * 100;
  return [
    input(
      "Test-to-source line ratio",
      t.testToSourceRatio,
      linear(-t.testToSourceRatio, -0.5, 0, 40),
      40,
    ),
    input(
      "Source areas with tests (%)",
      round1(areaCoverage),
      linear(-areaCoverage, -100, -20, 25),
      25,
    ),
    input("Test framework detected", t.frameworks.length > 0, t.frameworks.length > 0 ? 15 : 0, 15),
    input("End-to-end tests present", t.e2ePresent, t.e2ePresent ? 5 : 0, 5),
    input("Coverage configured", t.hasCoverageConfig, t.hasCoverageConfig ? 5 : 0, 5),
    input("No focused (.only) tests", t.onlyTests === 0, t.onlyTests === 0 ? 5 : 0, 5),
    input("Skipped tests", t.skippedTests, linear(t.skippedTests, 0, 30, 5), 5),
  ];
}

function baseMaintainability(m: MetricsDocument): ScoreInput[] {
  const s = m.structure;
  const q = m.quality;
  const ts = m.typescript;
  if (!s) return [input("Structure analyzer did not run", null, 50, 100, "Neutral score applied")];
  const sourceFiles = Math.max(1, m.testing?.sourceFiles ?? s.totalFiles);
  const largeShare = (s.largestFiles.filter((f) => f.lines >= 1000).length / sourceFiles) * 100;
  const dupPct = (q?.duplicationRatio ?? 0) * 100;
  const todoPerK = ((q?.todoCount ?? 0) / sourceFiles) * 100;
  const unusedShare =
    ts && ts.exportedSymbols > 0 ? (ts.unusedExports / ts.exportedSymbols) * 100 : 0;
  return [
    input("README present", s.hasReadme, s.hasReadme ? 15 : 0, 15),
    input("License present", s.hasLicense, s.hasLicense ? 5 : 0, 5),
    input("Duplicated lines (%)", round1(dupPct), linear(dupPct, 1, 15, 30), 30),
    input(
      "Files ≥ 1000 lines among 10 largest (% of source)",
      round1(largeShare),
      linear(largeShare, 0, 3, 15),
      15,
    ),
    input("TODO/HACK markers per 100 files", round1(todoPerK), linear(todoPerK, 5, 60, 15), 15),
    input("Unused exports (%)", round1(unusedShare), linear(unusedShare, 5, 40, 20), 20),
  ];
}

function baseGitHealth(m: MetricsDocument): ScoreInput[] {
  const g = m.gitHistory;
  if (!g?.available)
    return [input("Git history not available", null, 50, 100, "Neutral score applied")];
  const recent = g.commitsPerWeek.slice(-12).reduce((a, w) => a + w.commits, 0);
  return [
    input(
      "Bus factor",
      g.busFactor,
      g.busFactor >= 3 ? 30 : g.busFactor === 2 ? 20 : g.commits < 20 ? 15 : 5,
      30,
      g.commits < 20 ? "Few commits; small penalty" : undefined,
    ),
    input(
      "Days since last commit",
      g.daysSinceLastCommit,
      linear(g.daysSinceLastCommit ?? 999, 30, 365, 25),
      25,
    ),
    input("Commits in last 12 weeks", recent, linear(-recent, -20, 0, 15), 15),
    input("Very large commits", g.largeCommits, linear(g.largeCommits, 2, 25, 15), 15),
    input("Merge commit share", g.mergeCommitShare, linear(g.mergeCommitShare, 0.3, 0.7, 15), 15),
  ];
}

const BASE: Record<Category, (m: MetricsDocument) => ScoreInput[]> = {
  quality: baseQuality,
  complexity: baseComplexity,
  architecture: baseArchitecture,
  dependencies: baseDependencies,
  testing: baseTesting,
  maintainability: baseMaintainability,
  gitHealth: baseGitHealth,
};

export function computeScoring(metrics: MetricsDocument, findings: FindingInput[]): Scoring {
  const categories: CategoryScoreDetail[] = CATEGORIES.map((category) => {
    const inputs = BASE[category](metrics);
    const max = inputs.reduce((a, i) => a + i.max, 0) || 100;
    const earned = inputs.reduce((a, i) => a + i.points, 0);
    const base = round1((earned / max) * 100);
    const sizeFactor = Math.max(1, (metrics.testing?.sourceFiles ?? 0) / PENALTY_SIZE_UNIT);
    const raw = findings
      .filter((f) => f.category === category && PENALIZED_RULES.has(f.ruleId))
      .reduce((a, f) => a + SEVERITY_PENALTY[f.severity], 0);
    const penalty = Math.min(MAX_FINDING_PENALTY, raw / sizeFactor);
    return {
      category,
      weight: CATEGORY_WEIGHTS[category],
      base,
      findingPenalty: round1(penalty),
      inputs,
      score: round1(clamp(base - penalty)),
    };
  });
  const totalWeight = categories.reduce((a, c) => a + c.weight, 0);
  const healthScore = round1(categories.reduce((a, c) => a + c.score * c.weight, 0) / totalWeight);
  return { version: SCORING_VERSION, healthScore, categories };
}

export function categoryScoresOf(scoring: Scoring): CategoryScores {
  const out = {} as CategoryScores;
  for (const c of scoring.categories) out[c.category] = c.score;
  return out;
}
