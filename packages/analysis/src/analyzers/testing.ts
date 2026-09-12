import type { TestingMetrics } from "@repolens/shared";
import { Node, SyntaxKind } from "ts-morph";
import { repoPathOf } from "../ast/project";
import { finding, pluralize } from "../findings";
import { readTextFile, topLevelDir } from "../fs/enumerate";
import { isAuxiliaryPath } from "../fs/languages";
import type { Analyzer, AnalyzerContext, AnalyzerResult } from "../types";

const FRAMEWORK_PACKAGES: Record<string, string> = {
  vitest: "Vitest",
  jest: "Jest",
  mocha: "Mocha",
  ava: "AVA",
  "@playwright/test": "Playwright",
  cypress: "Cypress",
  "@testing-library/react": "Testing Library",
  "node:test": "node:test",
  tap: "node-tap",
  uvu: "uvu",
  jasmine: "Jasmine",
};

const TEST_CALLEES = new Set(["it", "test", "specify"]);
const RATIO_HIGH = 0.1;
const RATIO_MEDIUM = 0.25;
const MIN_SOURCE_FILES_FOR_AREA = 5;

function collectDeps(pkgText: string | null): Set<string> {
  const out = new Set<string>();
  if (!pkgText) return out;
  try {
    const pkg = JSON.parse(pkgText) as Record<string, Record<string, string> | undefined>;
    for (const k of ["dependencies", "devDependencies"])
      for (const name of Object.keys(pkg[k] ?? {})) out.add(name);
  } catch {
    // ignored: dependencies analyzer reports malformed manifests
  }
  return out;
}

export const testingAnalyzer: Analyzer<TestingMetrics> = {
  key: "testing",
  critical: false,
  async run(ctx: AnalyzerContext): Promise<AnalyzerResult<TestingMetrics>> {
    const project = ctx.getProject();
    const frameworks = new Set<string>();

    // Manifests anywhere in the tree (monorepos declare test runners per package).
    const manifests = ctx.files.filter(
      (f) => f.path === "package.json" || f.path.endsWith("/package.json"),
    );
    for (const m of manifests.slice(0, 200)) {
      const deps = collectDeps(await readTextFile(ctx.rootDir, m.path));
      for (const [pkg, label] of Object.entries(FRAMEWORK_PACKAGES))
        if (deps.has(pkg)) frameworks.add(label);
    }
    for (const f of ctx.files) {
      if (/(^|\/)vitest\.config\./.test(f.path)) frameworks.add("Vitest");
      if (/(^|\/)jest\.config\./.test(f.path)) frameworks.add("Jest");
      if (/(^|\/)playwright\.config\./.test(f.path)) frameworks.add("Playwright");
      if (/(^|\/)cypress\.config\./.test(f.path)) frameworks.add("Cypress");
    }

    const testFiles = ctx.files.filter((f) => f.isTest && f.isSource);
    const sourceFiles = ctx.files.filter(
      (f) =>
        f.isSource &&
        !f.isTest &&
        !/\.(config|setup)\.[cm]?[jt]s$/.test(f.path) &&
        !/\.d\.ts$/.test(f.path),
    );
    const testLines = testFiles.reduce((a, f) => a + f.lines, 0);
    const sourceLines = sourceFiles.reduce((a, f) => a + f.lines, 0);

    let testCases = 0;
    let skippedTests = 0;
    let onlyTests = 0;
    const onlyLocations: Array<{ file: string; line: number }> = [];
    const testFilePaths = new Set(testFiles.map((f) => f.path));
    for (const sf of project.getSourceFiles()) {
      const file = repoPathOf(sf.getFilePath());
      if (!testFilePaths.has(file)) continue;
      const text = sf.getFullText();
      if (/from ["']node:test["']/.test(text)) frameworks.add("node:test");
      for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        const expr = call.getExpression();
        if (Node.isIdentifier(expr)) {
          const name = expr.getText();
          if (TEST_CALLEES.has(name)) testCases++;
          else if (name === "xit" || name === "xtest" || name === "xdescribe") skippedTests++;
          else if (name === "fit" || name === "ftest" || name === "fdescribe") {
            onlyTests++;
            onlyLocations.push({ file, line: call.getStartLineNumber() });
          }
        } else if (Node.isPropertyAccessExpression(expr)) {
          const obj = expr.getExpression().getText();
          const prop = expr.getName();
          if (TEST_CALLEES.has(obj) || obj === "describe") {
            // it.skip / it.only are still test cases; describe.* modifiers are not.
            if (TEST_CALLEES.has(obj) && prop !== "todo") testCases++;
            if (prop === "skip" || prop === "todo") skippedTests++;
            else if (prop === "only") {
              onlyTests++;
              onlyLocations.push({ file, line: call.getStartLineNumber() });
            }
          }
        }
      }
    }

    // Untested areas: top-level (or second-level for src/, packages/, apps/) source directories.
    const areaOf = (p: string): string => {
      const top = topLevelDir(p);
      if (
        top === "src" ||
        top === "packages" ||
        top === "apps" ||
        top === "lib" ||
        top === "libs"
      ) {
        const rest = p.slice(top.length + 1);
        const second = topLevelDir(rest);
        return second ? `${top}/${second}` : top;
      }
      return top;
    };
    const areaSources = new Map<string, number>();
    const areaTests = new Map<string, number>();
    for (const f of sourceFiles) {
      if (isAuxiliaryPath(f.path)) continue;
      const a = areaOf(f.path);
      if (!a) continue;
      areaSources.set(a, (areaSources.get(a) ?? 0) + 1);
    }
    for (const f of testFiles) {
      const a = areaOf(f.path);
      if (!a) continue;
      areaTests.set(a, (areaTests.get(a) ?? 0) + 1);
    }
    // A repo-level tests/ or e2e/ directory counts for every area, so only flag areas when tests are
    // colocated somewhere (otherwise per-area attribution would be meaningless).
    const colocated = [...areaTests.keys()].some((a) => areaSources.has(a));
    const sourceDirsWithoutTests = colocated
      ? [...areaSources.entries()]
          .filter(([a, count]) => count >= MIN_SOURCE_FILES_FOR_AREA && !areaTests.has(a))
          .map(([path, count]) => ({ path, sourceFiles: count }))
          .sort((a, b) => b.sourceFiles - a.sourceFiles || a.path.localeCompare(b.path))
      : [];
    const sourceDirsWithTests = [...areaSources.keys()].filter((a) => areaTests.has(a)).length;

    const hasCoverageConfig =
      ctx.files.some((f) => /(^|\/)(\.nycrc|\.c8rc|codecov\.ya?ml|\.coveragerc)/.test(f.path)) ||
      (
        await Promise.all(
          ctx.files
            .filter((f) => /(^|\/)(vitest|jest)\.config\.[cm]?[jt]s$/.test(f.path))
            .slice(0, 20)
            .map(async (f) => /coverage/.test((await readTextFile(ctx.rootDir, f.path)) ?? "")),
        )
      ).some(Boolean) ||
      (manifests.length > 0 &&
        (await readTextFile(ctx.rootDir, "package.json"))?.includes("--coverage") === true);
    const e2ePresent =
      frameworks.has("Playwright") ||
      frameworks.has("Cypress") ||
      ctx.files.some((f) => /(^|\/)(e2e|cypress)\//.test(f.path) && f.isSource);
    const ratio = sourceLines > 0 ? Math.round((testLines / sourceLines) * 1000) / 1000 : 0;

    const findings = [];
    if (sourceFiles.length > 0 && testFiles.length === 0) {
      findings.push(
        finding({
          ruleId: "testing/no-tests",
          category: "testing",
          severity: "critical",
          title: "No test files found",
          message: `The repository has ${pluralize(sourceFiles.length, "source file")} and no test files (*.test.*, *.spec.*, __tests__/, tests/, e2e/). Behaviour can regress without any signal.`,
          recommendation:
            "Add a test runner (Vitest or Jest) and cover the most critical modules first: entry points, data transformations and anything with high complexity.",
        }),
      );
    } else if (sourceFiles.length > 0 && ratio < RATIO_MEDIUM) {
      findings.push(
        finding({
          ruleId: "testing/low-ratio",
          category: "testing",
          severity: ratio < RATIO_HIGH ? "high" : "medium",
          title: `Test-to-source ratio is ${(ratio * 100).toFixed(0)}%`,
          message: `${pluralize(testLines, "test line")} against ${pluralize(sourceLines, "source line")}. Mature TypeScript projects typically sit between 30% and 100%.`,
          evidence: { data: { testLines, sourceLines, ratio } },
          recommendation:
            "Prioritise tests for the hotspots and high-complexity functions reported in this analysis.",
        }),
      );
    }
    if (onlyTests > 0) {
      const first = onlyLocations[0];
      findings.push(
        finding({
          ruleId: "testing/only-committed",
          category: "testing",
          severity: "high",
          title: `${pluralize(onlyTests, "focused test")} (.only) committed`,
          message: `A committed .only/fit/fdescribe restricts the suite to a single test, so the rest of the suite is silently skipped in CI. First occurrence: ${first?.file}:${first?.line}.`,
          filePath: first?.file ?? null,
          line: first?.line ?? null,
          symbol: "only",
          evidence: { relatedPaths: onlyLocations.slice(0, 10).map((l) => `${l.file}:${l.line}`) },
          recommendation:
            "Remove .only and add a lint rule (no-focused-tests) to block it in the future.",
        }),
      );
    }
    if (skippedTests > 0) {
      findings.push(
        finding({
          ruleId: "testing/skipped-tests",
          category: "testing",
          severity: "low",
          title: `${pluralize(skippedTests, "skipped test")}`,
          message: `${skippedTests} tests are marked skip/todo/xit. Skipped tests decay quietly and stop reflecting the code.`,
          symbol: "skip",
          recommendation: "Fix or delete skipped tests; track intentional gaps as issues instead.",
        }),
      );
    }
    for (const area of sourceDirsWithoutTests.slice(0, 20)) {
      findings.push(
        finding({
          ruleId: "testing/untested-area",
          category: "testing",
          severity: "medium",
          title: `No tests under ${area.path}`,
          message: `${area.path} contains ${pluralize(area.sourceFiles, "source file")} and no test files, while other areas of the repository are tested.`,
          filePath: area.path,
          symbol: area.path,
          evidence: { data: { sourceFiles: area.sourceFiles } },
          recommendation:
            "Add tests for this area, starting with its most complex or most changed files.",
        }),
      );
    }

    const metrics: TestingMetrics = {
      frameworks: [...frameworks].sort(),
      testFiles: testFiles.length,
      testLines,
      sourceFiles: sourceFiles.length,
      sourceLines,
      testToSourceRatio: ratio,
      testCases,
      skippedTests,
      onlyTests,
      sourceDirsWithoutTests,
      sourceDirsWithTests,
      hasCoverageConfig,
      e2ePresent,
    };
    return {
      metrics,
      findings,
      detail: `${pluralize(testFiles.length, "test file")}, ${pluralize(testCases, "test case")}, ratio ${(ratio * 100).toFixed(0)}%`,
    };
  },
};
