import type { DependenciesMetrics } from "@repolens/shared";
import { fetchAdvisories } from "../deps/advisories";
import { detectLockfile, duplicateVersions, parseLockfile } from "../deps/lockfiles";
import { finding, pluralize } from "../findings";
import { readTextFile } from "../fs/enumerate";
import type { Analyzer, AnalyzerContext, AnalyzerResult } from "../types";

/** Packages widely replaced by maintained alternatives. Reason text is shown to the user. */
export const DEPRECATED_PACKAGES: Record<string, string> = {
  request: "deprecated since 2020; use fetch, undici or got",
  "request-promise": "deprecated with request; use fetch or got",
  moment: "in maintenance mode; use date-fns, dayjs or Temporal",
  "node-sass": "deprecated; use sass (Dart Sass)",
  tslint: "deprecated in favour of ESLint or Biome",
  "babel-eslint": "replaced by @babel/eslint-parser",
  "left-pad": "built into String.prototype.padStart",
  colors: "compromised release history; use chalk or picocolors",
  faker: "abandoned; use @faker-js/faker",
  "core-js@2": "unsupported major version",
  istanbul: "replaced by nyc or c8",
  "gulp-util": "deprecated by the gulp team",
  bower: "deprecated package manager",
  "uuid@3": "old major; upgrade uuid",
  querystring: "Node legacy API; use URLSearchParams",
  "@types/react-router-dom": "types now ship with react-router-dom",
  "react-scripts": "Create React App is no longer maintained",
  "@babel/polyfill": "deprecated; use core-js and regenerator-runtime directly",
  mkdirp: "use fs.mkdir with { recursive: true }",
  "rimraf@2": "old major; fs.rm handles recursive deletes",
};

const HEAVY_DIRECT_THRESHOLD = 80;
const MAX_MANIFESTS = 200;

interface Manifest {
  path: string;
  name?: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  engines?: Record<string, string>;
  workspaces?: unknown;
}

function readManifest(path: string, text: string): Manifest | null {
  try {
    const raw = JSON.parse(text) as Partial<Manifest> & { engines?: Record<string, string> };
    return {
      path,
      name: typeof raw.name === "string" ? raw.name : undefined,
      dependencies:
        typeof raw.dependencies === "object" && raw.dependencies ? raw.dependencies : {},
      devDependencies:
        typeof raw.devDependencies === "object" && raw.devDependencies ? raw.devDependencies : {},
      engines: typeof raw.engines === "object" && raw.engines ? raw.engines : undefined,
      workspaces: raw.workspaces,
    };
  } catch {
    return null;
  }
}

function isWildcardRange(range: string): boolean {
  const r = range.trim();
  return r === "*" || r === "latest" || r === "" || r === "x" || /^>=?\s*\d/.test(r);
}

function isGitOrUrl(range: string): boolean {
  const r = range.trim();
  return (
    /^(git\+|git:|github:|gitlab:|bitbucket:|https?:|ssh:|file:)/.test(r) ||
    (/^[\w-]+\/[\w.-]+(#|$)/.test(r) && !r.startsWith("@"))
  );
}

export const dependenciesAnalyzer: Analyzer<DependenciesMetrics> = {
  key: "dependencies",
  critical: false,
  async run(ctx: AnalyzerContext): Promise<AnalyzerResult<DependenciesMetrics>> {
    const paths = new Set(ctx.files.map((f) => f.path));
    const manifestFiles = ctx.files
      .filter((f) => f.path === "package.json" || f.path.endsWith("/package.json"))
      .slice(0, MAX_MANIFESTS);
    const manifests: Manifest[] = [];
    const findings = [];
    for (const f of manifestFiles) {
      const text = await readTextFile(ctx.rootDir, f.path);
      if (text === null) continue;
      const m = readManifest(f.path, text);
      if (!m) {
        findings.push(
          finding({
            ruleId: "deps/invalid-manifest",
            category: "dependencies",
            severity: "medium",
            title: "package.json is not valid JSON",
            message: `${f.path} could not be parsed as JSON.`,
            filePath: f.path,
            recommendation:
              "Fix the syntax error; most tooling will refuse to run until it is valid.",
          }),
        );
        continue;
      }
      manifests.push(m);
    }
    const root = manifests.find((m) => m.path === "package.json") ?? null;
    const workspaceNames = new Set(
      manifests.map((m) => m.name).filter((n): n is string => Boolean(n)),
    );

    const direct = new Map<string, { range: string; dev: boolean; manifest: string }>();
    const unpinnedRanges: DependenciesMetrics["unpinnedRanges"] = [];
    const gitOrUrlDeps: DependenciesMetrics["gitOrUrlDeps"] = [];
    const deprecatedPackages: DependenciesMetrics["deprecatedPackages"] = [];
    let directDev = 0;
    let directProd = 0;
    for (const m of manifests) {
      for (const [dev, deps] of [
        [false, m.dependencies],
        [true, m.devDependencies],
      ] as const) {
        for (const [name, range] of Object.entries(deps)) {
          if (typeof range !== "string") continue;
          if (range.startsWith("workspace:") || workspaceNames.has(name)) continue;
          if (!direct.has(name)) {
            direct.set(name, { range, dev, manifest: m.path });
            if (dev) directDev++;
            else directProd++;
          }
          if (isWildcardRange(range)) unpinnedRanges.push({ name, range, manifest: m.path });
          if (isGitOrUrl(range)) gitOrUrlDeps.push({ name, spec: range, manifest: m.path });
          const reason = DEPRECATED_PACKAGES[name];
          if (reason && !deprecatedPackages.some((d) => d.name === name && d.manifest === m.path)) {
            deprecatedPackages.push({ name, reason, manifest: m.path });
          }
        }
      }
    }

    const lock = detectLockfile(paths);
    let resolved: ReturnType<typeof parseLockfile> = [];
    if (lock && lock.file !== "bun.lockb") {
      const text = await readTextFile(ctx.rootDir, lock.file, 32 * 1024 * 1024);
      if (text) resolved = parseLockfile(lock.type, text);
    }
    const dupes = duplicateVersions(resolved);

    let vulnerabilities: DependenciesMetrics["vulnerabilities"] = null;
    if (ctx.fetch && resolved.length > 0) {
      vulnerabilities = await fetchAdvisories(resolved, ctx.fetch, ctx.signal);
    }

    if (manifests.length > 0 && !lock) {
      findings.push(
        finding({
          ruleId: "deps/no-lockfile",
          category: "dependencies",
          severity: "high",
          title: "No lockfile committed",
          message:
            "No package-lock.json, pnpm-lock.yaml, yarn.lock or bun.lock was found. Every install can resolve different versions, so builds are not reproducible.",
          recommendation:
            "Commit the lockfile produced by your package manager and install with a frozen lockfile in CI.",
        }),
      );
    }
    for (const u of unpinnedRanges.slice(0, 50)) {
      findings.push(
        finding({
          ruleId: "deps/wildcard-range",
          category: "dependencies",
          severity: "medium",
          title: `Unbounded version range for ${u.name}`,
          message: `${u.manifest} declares ${u.name}@"${u.range}". Any future major version, including breaking changes, satisfies this range.`,
          filePath: u.manifest,
          symbol: u.name,
          evidence: { data: { range: u.range } },
          recommendation:
            "Use a caret or tilde range (for example ^1.4.0) so upgrades stay within a compatible major version.",
        }),
      );
    }
    for (const g of gitOrUrlDeps.slice(0, 50)) {
      findings.push(
        finding({
          ruleId: "deps/git-url-dependency",
          category: "dependencies",
          severity: "medium",
          title: `${g.name} is installed from a URL or git reference`,
          message: `${g.manifest} depends on ${g.name} via "${g.spec}". Git and URL dependencies bypass registry integrity checks and can change or disappear.`,
          filePath: g.manifest,
          symbol: g.name,
          evidence: { data: { spec: g.spec } },
          recommendation:
            "Publish the package to a registry or pin the git dependency to a full commit SHA.",
        }),
      );
    }
    for (const d of deprecatedPackages.slice(0, 50)) {
      findings.push(
        finding({
          ruleId: "deps/deprecated-package",
          category: "dependencies",
          severity: "low",
          title: `${d.name} is deprecated or unmaintained`,
          message: `${d.manifest} depends on ${d.name}: ${d.reason}.`,
          filePath: d.manifest,
          symbol: d.name,
          recommendation: `Migrate away from ${d.name}.`,
        }),
      );
    }
    for (const dup of dupes.filter((d) => d.versions.length > 2).slice(0, 30)) {
      findings.push(
        finding({
          ruleId: "deps/duplicate-versions",
          category: "dependencies",
          severity: "low",
          title: `${dup.name} resolved to ${dup.versions.length} versions`,
          message: `The lockfile contains ${dup.name} at ${dup.versions.join(", ")}. Multiple copies increase install and bundle size and can cause subtle type or singleton conflicts.`,
          filePath: lock?.file ?? null,
          symbol: dup.name,
          evidence: { data: { versions: dup.versions.join(", ") } },
          recommendation:
            "Deduplicate with your package manager (pnpm dedupe, npm dedupe, yarn dedupe) or align the ranges that pull in different majors.",
        }),
      );
    }
    if (vulnerabilities) {
      for (const adv of vulnerabilities.advisories.slice(0, 60)) {
        const sev =
          adv.severity === "critical"
            ? "critical"
            : adv.severity === "high"
              ? "high"
              : adv.severity === "moderate"
                ? "medium"
                : "low";
        findings.push(
          finding({
            ruleId: "deps/vulnerability",
            category: "dependencies",
            severity: sev,
            title: `${adv.package}@${adv.version}: ${adv.title}`,
            message: `${adv.package}@${adv.version} matches advisory "${adv.title}" (vulnerable range ${adv.vulnerableRange}).`,
            filePath: lock?.file ?? null,
            symbol: `${adv.package}@${adv.version}`,
            evidence: {
              data: { url: adv.url, severity: adv.severity, vulnerableRange: adv.vulnerableRange },
            },
            recommendation: `Upgrade ${adv.package} to a version outside ${adv.vulnerableRange}. Details: ${adv.url}`,
          }),
        );
      }
    }
    if (directProd > HEAVY_DIRECT_THRESHOLD) {
      findings.push(
        finding({
          ruleId: "deps/heavy-direct-dependencies",
          category: "dependencies",
          severity: "info",
          title: `${pluralize(directProd, "direct production dependency", "direct production dependencies")}`,
          message: `The repository declares ${directProd} direct production dependencies. Each one is an upgrade, audit and licence obligation.`,
          recommendation:
            "Review whether small utilities can be replaced by platform APIs, and remove unused packages.",
        }),
      );
    }

    const metrics: DependenciesMetrics = {
      manifests: manifests.length,
      direct: directProd,
      directDev,
      lockfilePresent: lock !== null,
      lockfileType: lock?.type ?? "none",
      resolvedPackages: new Set(resolved.map((p) => `${p.name}@${p.version}`)).size,
      duplicateVersions: dupes.slice(0, 50),
      unpinnedRanges: unpinnedRanges.slice(0, 100),
      gitOrUrlDeps: gitOrUrlDeps.slice(0, 100),
      deprecatedPackages,
      workspacePackages:
        root?.workspaces !== undefined || paths.has("pnpm-workspace.yaml")
          ? manifests.length - 1
          : 0,
      engines: root?.engines ?? null,
      topDependencies: [...direct.entries()]
        .filter(([, v]) => !v.dev)
        .slice(0, 40)
        .map(([name, v]) => ({ name, range: v.range, dev: v.dev })),
      vulnerabilities,
    };
    return {
      metrics,
      findings,
      detail: `${pluralize(directProd, "dependency", "dependencies")}, ${pluralize(directDev, "dev")}, ${metrics.resolvedPackages} resolved${vulnerabilities ? `, ${vulnerabilities.advisories.length} advisories` : ", audit not checked"}`,
    };
  },
};
