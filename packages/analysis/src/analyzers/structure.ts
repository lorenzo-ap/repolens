import type { StructureMetrics } from "@repolens/shared";
import { finding, pluralize } from "../findings";
import { readTextFile, topLevelDir } from "../fs/enumerate";
import type { Analyzer, AnalyzerContext, AnalyzerResult } from "../types";

const CI_PATTERNS: Array<{ provider: string; test: (p: string) => boolean }> = [
  { provider: "GitHub Actions", test: (p) => /^\.github\/workflows\/.+\.ya?ml$/.test(p) },
  { provider: "GitLab CI", test: (p) => p === ".gitlab-ci.yml" },
  { provider: "CircleCI", test: (p) => p.startsWith(".circleci/") },
  { provider: "Travis CI", test: (p) => p === ".travis.yml" },
  { provider: "Azure Pipelines", test: (p) => p === "azure-pipelines.yml" },
  { provider: "Bitbucket Pipelines", test: (p) => p === "bitbucket-pipelines.yml" },
  { provider: "Jenkins", test: (p) => p === "Jenkinsfile" },
  { provider: "Buildkite", test: (p) => p.startsWith(".buildkite/") },
];

const LARGE_FILE_LOW = 1000;
const LARGE_FILE_MEDIUM = 2500;

export const structureAnalyzer: Analyzer<StructureMetrics> = {
  key: "structure",
  critical: true,
  async run(ctx: AnalyzerContext): Promise<AnalyzerResult<StructureMetrics>> {
    const { files } = ctx;
    const byLanguage = new Map<string, { files: number; lines: number }>();
    const topLevel = new Map<string, number>();
    let totalLines = 0;
    const paths = new Set<string>();

    for (const f of files) {
      paths.add(f.path);
      totalLines += f.lines;
      const lang = f.language ?? "Binary";
      const entry = byLanguage.get(lang) ?? { files: 0, lines: 0 };
      entry.files++;
      entry.lines += f.lines;
      byLanguage.set(lang, entry);
      const top = topLevelDir(f.path);
      if (top) topLevel.set(top, (topLevel.get(top) ?? 0) + 1);
    }

    const rootFiles = files.filter((f) => !f.path.includes("/")).map((f) => f.path.toLowerCase());
    const hasReadme = rootFiles.some((p) => p.startsWith("readme"));
    const hasLicense = rootFiles.some((p) => p.startsWith("license") || p.startsWith("licence"));
    const hasEditorConfig = paths.has(".editorconfig");
    const hasDockerfile = files.some((f) => /(^|\/)dockerfile(\..+)?$/i.test(f.path));
    const ciProviders = CI_PATTERNS.filter((c) => files.some((f) => c.test(f.path))).map(
      (c) => c.provider,
    );

    const lockfiles = {
      pnpm: paths.has("pnpm-lock.yaml"),
      npm: paths.has("package-lock.json"),
      yarn: paths.has("yarn.lock"),
      bun: paths.has("bun.lock") || paths.has("bun.lockb"),
    };
    const lockCount = Object.values(lockfiles).filter(Boolean).length;
    const rootPkg = await readTextFile(ctx.rootDir, "package.json");
    let packageManager: StructureMetrics["packageManager"] = "unknown";
    let monorepo = false;
    if (rootPkg) {
      try {
        const pkg = JSON.parse(rootPkg) as { packageManager?: string; workspaces?: unknown };
        const pm = pkg.packageManager?.split("@")[0];
        if (pm === "pnpm" || pm === "npm" || pm === "yarn" || pm === "bun") packageManager = pm;
        monorepo = pkg.workspaces !== undefined;
      } catch {
        // malformed package.json is reported by the dependencies analyzer
      }
    }
    if (packageManager === "unknown") {
      if (lockfiles.pnpm) packageManager = "pnpm";
      else if (lockfiles.yarn) packageManager = "yarn";
      else if (lockfiles.bun) packageManager = "bun";
      else if (lockfiles.npm) packageManager = "npm";
    }
    if (paths.has("pnpm-workspace.yaml") || paths.has("lerna.json")) monorepo = true;

    const largestFiles = [...files]
      .filter((f) => f.lines > 0)
      .sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path))
      .slice(0, 10)
      .map((f) => ({ path: f.path, lines: f.lines }));

    const metrics: StructureMetrics = {
      totalFiles: files.length,
      totalLines,
      byLanguage: [...byLanguage.entries()]
        .map(([language, v]) => ({ language, ...v }))
        .sort((a, b) => b.lines - a.lines || a.language.localeCompare(b.language)),
      largestFiles,
      topLevelDirs: [...topLevel.entries()]
        .map(([path, count]) => ({ path, files: count }))
        .sort((a, b) => b.files - a.files || a.path.localeCompare(b.path))
        .slice(0, 30),
      hasReadme,
      hasLicense,
      hasCi: ciProviders.length > 0,
      ciProviders,
      hasEditorConfig,
      hasDockerfile,
      monorepo,
      packageManager,
      truncated: ctx.truncated,
    };

    const findings = [];
    if (!hasReadme) {
      findings.push(
        finding({
          ruleId: "structure/missing-readme",
          category: "maintainability",
          severity: "medium",
          title: "No README at the repository root",
          message: "The repository has no README file, so new contributors have no entry point.",
          recommendation:
            "Add a README.md that explains what the project does, how to run it and how to contribute.",
        }),
      );
    }
    if (!hasLicense) {
      findings.push(
        finding({
          ruleId: "structure/missing-license",
          category: "maintainability",
          severity: "low",
          title: "No LICENSE file",
          message: "Without a license, others cannot legally reuse this code.",
          recommendation:
            "Add a LICENSE file (for example MIT or Apache-2.0) at the repository root.",
        }),
      );
    }
    if (ciProviders.length === 0) {
      findings.push(
        finding({
          ruleId: "structure/no-ci",
          category: "quality",
          severity: "medium",
          title: "No continuous integration configuration detected",
          message:
            "No CI configuration (GitHub Actions, GitLab CI, CircleCI, …) was found, so tests and lint are not enforced on every change.",
          recommendation:
            "Add a CI workflow that runs type checking, linting and tests on pull requests.",
        }),
      );
    }
    if (lockCount > 1) {
      findings.push(
        finding({
          ruleId: "structure/mixed-lockfiles",
          category: "dependencies",
          severity: "medium",
          title: "Multiple package manager lockfiles",
          message: `Found ${lockCount} lockfiles (${Object.entries(lockfiles)
            .filter(([, v]) => v)
            .map(([k]) => k)
            .join(", ")}). Installs will differ depending on which package manager is used.`,
          recommendation: "Keep a single lockfile and declare the package manager in package.json.",
        }),
      );
    }
    for (const f of files) {
      if (!f.isSource || f.isTest) continue;
      if (f.lines >= LARGE_FILE_LOW) {
        findings.push(
          finding({
            ruleId: "structure/large-file",
            category: "maintainability",
            severity: f.lines >= LARGE_FILE_MEDIUM ? "medium" : "low",
            title: `Large file: ${pluralize(f.lines, "line")}`,
            message: `${f.path} has ${pluralize(f.lines, "line")}. Files this size are hard to navigate and tend to accumulate unrelated responsibilities.`,
            filePath: f.path,
            evidence: { data: { lines: f.lines, threshold: LARGE_FILE_LOW } },
            recommendation:
              "Split the file along responsibility boundaries (types, helpers, feature modules).",
          }),
        );
      }
    }

    return {
      metrics,
      findings,
      detail: `${pluralize(files.length, "file")}, ${pluralize(totalLines, "line")}${ctx.truncated ? " (truncated)" : ""}`,
    };
  },
};
