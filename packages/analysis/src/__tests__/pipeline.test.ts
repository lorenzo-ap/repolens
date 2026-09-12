import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fingerprintOf } from "../fingerprint";
import { type PipelineResult, runPipeline } from "../pipeline";
import { materializeFixture } from "./helpers";

let fixture: ReturnType<typeof materializeFixture>;
let result: PipelineResult;

beforeAll(async () => {
  fixture = materializeFixture("sample-app", { git: true });
  result = await runPipeline({ rootDir: fixture.dir, fetch: null });
}, 60_000);

afterAll(() => fixture?.cleanup());

const rules = () => result.findings.map((f) => f.ruleId);
const byRule = (id: string) => result.findings.filter((f) => f.ruleId === id);

describe("pipeline on sample-app", () => {
  it("runs every analyzer and scoring", () => {
    const completed = result.steps.filter((s) => s.status === "completed").map((s) => s.key);
    expect(completed).toEqual([
      "structure",
      "typescript",
      "quality",
      "complexity",
      "dependencies",
      "architecture",
      "testing",
      "gitHistory",
      "scoring",
    ]);
    expect(result.steps.some((s) => s.status === "failed")).toBe(false);
  });

  it("enumerates files while ignoring node_modules and .git", () => {
    const paths = result.metrics.structure?.largestFiles.map((f) => f.path) ?? [];
    expect(result.filesEnumerated).toBe(14);
    expect(paths.some((p) => p.includes("node_modules"))).toBe(false);
    expect(result.metrics.structure?.hasCi).toBe(true);
    expect(result.metrics.structure?.hasReadme).toBe(false);
    expect(result.metrics.structure?.packageManager).toBe("unknown");
  });

  it("detects TypeScript configuration and unsafe constructs", () => {
    const ts = result.metrics.typescript!;
    expect(ts.strictMode).toBe(false);
    expect(ts.anyCount).toBe(2);
    expect(ts.tsIgnoreCount).toBe(1);
    expect(rules()).toContain("ts/strict-disabled");
    expect(rules()).toContain("ts/ts-ignore");
    const unused = byRule("ts/unused-export").map((f) => f.symbol);
    expect(unused).toContain("formatDate");
    expect(unused).toContain("roundTrip");
    // helperFromA is imported by b.ts; server.ts matches the entry-point pattern and is exempt.
    expect(unused).not.toContain("helperFromA");
    expect(unused).not.toContain("unusedServerHelper");
  });

  it("flags the deliberately complex function", () => {
    const complex = byRule("complexity/high-cyclomatic");
    expect(complex).toHaveLength(1);
    expect(complex[0]?.symbol).toBe("OrderService.processOrder");
    expect(complex[0]?.severity).toBe("medium");
    expect(Number(complex[0]?.evidence.data?.cyclomatic)).toBeGreaterThan(20);
    expect(Number(complex[0]?.evidence.data?.cognitive)).toBeGreaterThan(40);
    expect(result.metrics.complexity?.maxCyclomatic).toBe(
      Number(complex[0]?.evidence.data?.cyclomatic),
    );
  });

  it("reports quality problems with locations", () => {
    expect(byRule("quality/empty-catch")).toHaveLength(1);
    expect(byRule("quality/empty-catch")[0]?.filePath).toBe("src/services/orders.ts");
    expect(byRule("quality/too-many-params")[0]?.symbol).toBe("OrderService.processOrder");
    expect(byRule("quality/deep-nesting")[0]?.symbol).toBe("OrderService.processOrder");
    expect(byRule("quality/fixme")[0]?.filePath).toBe("src/utils/validate.ts");
    expect(
      byRule("quality/console-log")
        .map((f) => f.filePath)
        .sort(),
    ).toEqual(["src/index.ts", "src/services/orders.ts"]);
    const dup = byRule("quality/duplicate-block");
    expect(dup).toHaveLength(1);
    expect(dup[0]?.evidence.relatedPaths?.[0]).toMatch(/^src\/legacy\/report[AB]\.ts:2$/);
    expect(result.metrics.quality?.lintConfig).toBe("none");
    expect(rules()).toContain("quality/no-linter");
  });

  it("reads dependencies from the manifest without a lockfile", () => {
    const d = result.metrics.dependencies!;
    expect(d.lockfilePresent).toBe(false);
    expect(d.direct).toBe(4);
    expect(d.directDev).toBe(2);
    expect(d.vulnerabilities).toBeNull();
    expect(rules()).toContain("deps/no-lockfile");
    expect(byRule("deps/wildcard-range")[0]?.symbol).toBe("request");
    expect(byRule("deps/git-url-dependency")[0]?.symbol).toBe("left-pad");
    expect(
      byRule("deps/deprecated-package")
        .map((f) => f.symbol)
        .sort(),
    ).toEqual(["left-pad", "moment", "request"]);
  });

  it("builds the module graph, resolves path aliases and finds the cycle", () => {
    const a = result.metrics.architecture!;
    expect(a.cycleCount).toBe(1);
    expect(a.cycles[0]?.paths).toEqual(["src/core/a.ts", "src/core/b.ts"]);
    expect(a.unresolvedImports).toBe(0);
    expect(
      result.graph?.fileEdges.some(
        (e) => e.from === "src/index.ts" && e.to === "src/utils/format.ts",
      ),
    ).toBe(true);
    expect(result.graph?.fileEdges.filter((e) => e.inCycle)).toHaveLength(2);
    expect(byRule("arch/circular-dependency")).toHaveLength(1);
    expect(byRule("arch/circular-dependency")[0]?.severity).toBe("medium");
    const dirs = result.graph?.dirNodes.map((n) => n.path).sort();
    expect(dirs).toEqual(["src", "src/core", "src/legacy", "src/services", "src/utils", "tests"]);
  });

  it("measures testing signals", () => {
    const t = result.metrics.testing!;
    expect(t.frameworks).toEqual(["Vitest"]);
    expect(t.testFiles).toBe(1);
    expect(t.testCases).toBe(2);
    expect(t.onlyTests).toBe(1);
    expect(t.skippedTests).toBe(1);
    expect(rules()).toContain("testing/only-committed");
    expect(rules()).toContain("testing/low-ratio");
  });

  it("reads git history and computes hotspots", () => {
    const g = result.metrics.gitHistory!;
    expect(g.available).toBe(true);
    expect(g.commits).toBe(3);
    expect(g.authorCount).toBe(2);
    expect(g.busFactor).toBe(1);
    expect(g.churn[0]?.file).toBe("src/services/orders.ts");
    expect(g.hotspots[0]?.file).toBe("src/services/orders.ts");
    expect(byRule("git/hotspot")[0]?.filePath).toBe("src/services/orders.ts");
    // Only 3 commits: too few to judge bus factor.
    expect(rules()).not.toContain("git/bus-factor");
  });

  it("produces a scoring breakdown whose inputs add up", () => {
    const s = result.metrics.scoring!;
    expect(s.healthScore).toBeGreaterThan(0);
    expect(s.healthScore).toBeLessThan(70);
    for (const c of s.categories) {
      const max = c.inputs.reduce((a, i) => a + i.max, 0);
      const earned = c.inputs.reduce((a, i) => a + i.points, 0);
      expect(earned).toBeLessThanOrEqual(max + 1e-6);
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(100);
    }
  });

  it("is deterministic", async () => {
    const again = await runPipeline({ rootDir: fixture.dir, fetch: null });
    const strip = (r: PipelineResult) => ({
      findings: r.findings.map(fingerprintOf).sort(),
      metrics: {
        ...r.metrics,
        gitHistory: { ...r.metrics.gitHistory, daysSinceLastCommit: 0, commitsPerWeek: [] },
      },
    });
    expect(strip(again)).toEqual(strip(result));
    expect(new Set(result.findings.map(fingerprintOf)).size).toBe(result.findings.length);
  });

  it("aborts promptly when the signal fires", async () => {
    const controller = new AbortController();
    controller.abort(new Error("timed out"));
    await expect(
      runPipeline({ rootDir: fixture.dir, fetch: null, signal: controller.signal }),
    ).rejects.toThrow(/timed out|aborted/i);
  });
});
