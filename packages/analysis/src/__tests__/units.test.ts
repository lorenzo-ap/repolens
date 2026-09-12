import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MetricsDocument } from "@repolens/shared";
import { afterEach, describe, expect, it } from "vitest";
import { parseGitLog } from "../analyzers/git-history";
import { fetchAdvisories } from "../deps/advisories";
import { fingerprintOf } from "../fingerprint";
import { enumerateFiles } from "../fs/enumerate";
import { isTestPath, languageFor } from "../fs/languages";
import { stronglyConnectedComponents } from "../graph/tarjan";
import { computeScoring, linear } from "../scoring/score";

describe("tarjan", () => {
  it("finds cycles and ignores acyclic parts", () => {
    const edges = new Map<string, Set<string>>([
      ["a", new Set(["b"])],
      ["b", new Set(["c"])],
      ["c", new Set(["a", "d"])],
      ["d", new Set(["e"])],
      ["e", new Set(["d"])],
      ["f", new Set(["a"])],
    ]);
    const scc = stronglyConnectedComponents(["a", "b", "c", "d", "e", "f"], edges);
    expect(scc).toEqual([
      ["a", "b", "c"],
      ["d", "e"],
    ]);
  });

  it("handles a long chain without recursion limits", () => {
    const n = 20_000;
    const nodes = Array.from({ length: n }, (_, i) => `n${i}`);
    const edges = new Map(nodes.map((v, i) => [v, new Set(i + 1 < n ? [`n${i + 1}`] : ["n0"])]));
    const scc = stronglyConnectedComponents(nodes, edges);
    expect(scc).toHaveLength(1);
    expect(scc[0]).toHaveLength(n);
  });
});

describe("scoring", () => {
  it("linear transform is monotonic and clamped", () => {
    expect(linear(0, 0, 10, 20)).toBe(20);
    expect(linear(5, 0, 10, 20)).toBe(10);
    expect(linear(50, 0, 10, 20)).toBe(0);
    expect(linear(-0.2, -0.5, 0, 40)).toBe(16);
  });

  it("applies neutral scores when analyzers did not run", () => {
    const empty: MetricsDocument = {
      structure: null,
      typescript: null,
      quality: null,
      complexity: null,
      dependencies: null,
      architecture: null,
      testing: null,
      gitHistory: null,
      scoring: null,
    };
    const s = computeScoring(empty, []);
    expect(s.healthScore).toBe(50);
    expect(s.categories.every((c) => c.score === 50)).toBe(true);
  });

  it("caps finding penalties per category", () => {
    const empty: MetricsDocument = {
      structure: null,
      typescript: null,
      quality: null,
      complexity: null,
      dependencies: null,
      architecture: null,
      testing: null,
      gitHistory: null,
      scoring: null,
    };
    const findings = Array.from({ length: 100 }, () => ({
      ruleId: "quality/x",
      category: "quality" as const,
      severity: "critical" as const,
      title: "t",
      message: "m",
      filePath: null,
      line: null,
      endLine: null,
      symbol: null,
      evidence: {},
      recommendation: "r",
    }));
    const s = computeScoring(empty, findings);
    const q = s.categories.find((c) => c.category === "quality")!;
    expect(q.findingPenalty).toBe(40);
    expect(q.score).toBe(10);
  });
});

describe("enumerateFiles", () => {
  let dir: string;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it("skips symlinks, ignored directories, and honours the file limit", async () => {
    dir = mkdtempSync(join(tmpdir(), "repolens-enum-"));
    mkdirSync(join(dir, "src"));
    mkdirSync(join(dir, "node_modules", "x"), { recursive: true });
    mkdirSync(join(dir, "dist"));
    writeFileSync(join(dir, "src", "a.ts"), "export const a = 1;\n");
    writeFileSync(join(dir, "src", "b.ts"), "export const b = 2;\n");
    writeFileSync(join(dir, "node_modules", "x", "index.js"), "module.exports = 1;\n");
    writeFileSync(join(dir, "dist", "out.js"), "var a=1;\n");
    writeFileSync(join(dir, "image.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0]));
    symlinkSync("/etc/passwd", join(dir, "src", "link.ts"));
    const res = await enumerateFiles(dir);
    expect(res.files.map((f) => f.path)).toEqual(["image.png", "src/a.ts", "src/b.ts"]);
    expect(res.skippedSymlinks).toBe(1);
    expect(res.files.find((f) => f.path === "image.png")?.language).toBeNull();
    expect(res.files.find((f) => f.path === "src/a.ts")?.lines).toBe(1);
    const limited = await enumerateFiles(dir, { maxFiles: 2 });
    expect(limited.truncated).toBe(true);
    expect(limited.files).toHaveLength(2);
  });
});

describe("languages", () => {
  it("classifies paths", () => {
    expect(languageFor("src/a.tsx")).toBe("TypeScript");
    expect(languageFor("Dockerfile")).toBe("Dockerfile");
    expect(languageFor("LICENSE")).toBe("Text");
    expect(languageFor("a.png")).toBeNull();
    expect(isTestPath("src/__tests__/x.ts")).toBe(true);
    expect(isTestPath("src/x.spec.tsx")).toBe(true);
    expect(isTestPath("src/testing-utils.ts")).toBe(false);
  });
});

describe("parseGitLog", () => {
  it("parses records, numstat and renames", () => {
    const RS = String.fromCharCode(0x1e);
    const FS = String.fromCharCode(0x1f);
    const out = `${RS}abc${FS}Alice${FS}a@x${FS}2024-01-01T00:00:00+00:00${FS}p1\n\n3\t1\tsrc/a.ts\n-\t-\timg.png\n${RS}def${FS}Bob${FS}b@x${FS}2024-01-02T00:00:00+00:00${FS}p1 p2\n\n1\t0\tsrc/{old => new}/f.ts\n`;
    const commits = parseGitLog(out);
    expect(commits).toHaveLength(2);
    expect(commits[0]?.files).toEqual([
      { path: "src/a.ts", added: 3, deleted: 1 },
      { path: "img.png", added: 0, deleted: 0 },
    ]);
    expect(commits[1]?.isMerge).toBe(true);
    expect(commits[1]?.files[0]?.path).toBe("src/new/f.ts");
  });
});

describe("fingerprintOf", () => {
  const base = {
    ruleId: "quality/long-function",
    category: "quality" as const,
    severity: "medium" as const,
    title: "t",
    message: "m",
    filePath: "src/a.ts",
    line: 10,
    endLine: 20,
    symbol: "doThing",
    evidence: {},
    recommendation: "r",
  };
  it("is stable across line shifts when a symbol is present", () => {
    expect(fingerprintOf(base)).toBe(fingerprintOf({ ...base, line: 400 }));
  });
  it("changes with file or rule", () => {
    expect(fingerprintOf(base)).not.toBe(fingerprintOf({ ...base, filePath: "src/b.ts" }));
    expect(fingerprintOf(base)).not.toBe(fingerprintOf({ ...base, ruleId: "quality/x" }));
  });
});

describe("fetchAdvisories", () => {
  it("matches vulnerable ranges and returns null on failure", async () => {
    const ok = (async () =>
      new Response(
        JSON.stringify({
          lodash: [
            {
              id: 1,
              url: "https://x",
              title: "Prototype pollution",
              severity: "high",
              vulnerable_versions: "<4.17.21",
            },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const res = await fetchAdvisories(
      [
        { name: "lodash", version: "4.17.20" },
        { name: "lodash", version: "4.17.21" },
      ],
      ok,
    );
    expect(res?.high).toBe(1);
    expect(res?.advisories[0]?.version).toBe("4.17.20");
    const bad = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    expect(await fetchAdvisories([{ name: "lodash", version: "4.17.20" }], bad)).toBeNull();
  });
});
