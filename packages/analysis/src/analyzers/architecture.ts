import type { ArchitectureMetrics } from "@repolens/shared";
import { Node, SyntaxKind } from "ts-morph";
import { repoPathOf } from "../ast/project";
import { finding, pluralize } from "../findings";
import { readTextFile } from "../fs/enumerate";
import { isAuxiliaryPath } from "../fs/languages";
import { stronglyConnectedComponents } from "../graph/tarjan";
import type { Analyzer, AnalyzerContext, AnalyzerResult } from "../types";
import { throwIfAborted } from "../types";
import { resolveBase, resolveRelative } from "./typescript";

export interface FileGraph {
  /** Files that are nodes (all parsed source files). */
  nodes: string[];
  /** from -> set of to (internal, resolved). */
  edges: Map<string, Set<string>>;
  externalEdges: number;
  unresolved: number;
  /** Lines of code per file for aggregation. */
  loc: Map<string, number>;
  /** Files referenced only through type-only imports (not edges, but not orphans either). */
  typeReferenced: Set<string>;
}

export interface GraphNode {
  path: string;
  kind: "dir" | "file";
  parentPath: string | null;
  loc: number;
  fileCount: number;
  fanIn: number;
  fanOut: number;
  instability: number | null;
  inCycle: boolean;
}

export interface GraphEdge {
  kind: "dir" | "file";
  from: string;
  to: string;
  weight: number;
  inCycle: boolean;
}

export interface ArchitectureGraph {
  fileNodes: GraphNode[];
  fileEdges: GraphEdge[];
  dirNodes: GraphNode[];
  dirEdges: GraphEdge[];
  cycles: string[][];
}

/** Separator for composite map keys; NUL cannot appear in a path. */
const SEP = String.fromCharCode(0);
const HUB_MIN_FAN_IN = 15;
const GOD_FILE_FAN_OUT = 40;
const MAX_CYCLE_FINDINGS = 40;

interface PathAliases {
  /** e.g. "@/*" -> ["src/*"] resolved against the config's directory. */
  patterns: Array<{ prefix: string; suffix: string; targets: string[] }>;
  workspaceNames: Map<string, string>; // package name -> package dir
}

async function readAliases(ctx: AnalyzerContext): Promise<PathAliases> {
  const patterns: PathAliases["patterns"] = [];
  const tsconfigs = ctx.files
    .filter((f) => /(^|\/)tsconfig(\..+)?\.json$/.test(f.path) && !f.path.includes("node_modules"))
    .slice(0, 50);
  for (const tc of tsconfigs) {
    const text = await readTextFile(ctx.rootDir, tc.path);
    if (!text) continue;
    let config: { compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } };
    try {
      // tsconfig allows comments and trailing commas; strip conservatively.
      config = JSON.parse(
        text
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "")
          .replace(/,\s*([}\]])/g, "$1"),
      );
    } catch {
      continue;
    }
    const dir = tc.path.includes("/") ? tc.path.slice(0, tc.path.lastIndexOf("/")) : "";
    const baseUrl = config.compilerOptions?.baseUrl ?? ".";
    const base = normalizeJoin(dir, baseUrl);
    for (const [pattern, targets] of Object.entries(config.compilerOptions?.paths ?? {})) {
      const star = pattern.indexOf("*");
      patterns.push({
        prefix: star === -1 ? pattern : pattern.slice(0, star),
        suffix: star === -1 ? "" : pattern.slice(star + 1),
        targets: targets.map((t) => normalizeJoin(base, t)),
      });
    }
  }
  const workspaceNames = new Map<string, string>();
  for (const f of ctx.files
    .filter((f) => f.path.endsWith("package.json") && f.path !== "package.json")
    .slice(0, 200)) {
    const text = await readTextFile(ctx.rootDir, f.path);
    if (!text) continue;
    try {
      const pkg = JSON.parse(text) as { name?: string };
      if (pkg.name)
        workspaceNames.set(pkg.name, f.path.slice(0, -"package.json".length).replace(/\/$/, ""));
    } catch {
      // reported by dependencies analyzer
    }
  }
  return { patterns, workspaceNames };
}

function normalizeJoin(dir: string, rel: string): string {
  const segments = [...(dir ? dir.split("/") : []), ...rel.split("/")];
  const out: string[] = [];
  for (const s of segments) {
    if (s === "." || s === "") continue;
    if (s === "..") out.pop();
    else out.push(s);
  }
  return out.join("/");
}

function resolveSpecifier(
  fromFile: string,
  spec: string,
  files: Set<string>,
  aliases: PathAliases,
): string | null | "external" {
  if (spec.startsWith(".")) return resolveRelative(fromFile, spec, files);
  if (spec.startsWith("/")) return null;
  for (const p of aliases.patterns) {
    if (!spec.startsWith(p.prefix) || !spec.endsWith(p.suffix)) continue;
    const middle = spec.slice(p.prefix.length, spec.length - p.suffix.length);
    for (const t of p.targets) {
      const candidate = t.includes("*") ? t.replace("*", middle) : t;
      const r = resolveBase(candidate, files);
      if (r) return r;
    }
  }
  // Workspace packages: "@scope/pkg" or "@scope/pkg/sub".
  for (const [name, dir] of aliases.workspaceNames) {
    if (spec === name || spec.startsWith(`${name}/`)) {
      const sub = spec === name ? "" : spec.slice(name.length + 1);
      const candidates = sub
        ? [`${dir}/${sub}`, `${dir}/src/${sub}`]
        : [`${dir}/src/index`, `${dir}/index`, `${dir}/src/main`];
      for (const c of candidates) {
        const r = resolveBase(c, files);
        if (r) return r;
      }
      return null;
    }
  }
  return "external";
}

export async function buildFileGraph(ctx: AnalyzerContext): Promise<FileGraph> {
  const project = ctx.getProject();
  const files = new Set(ctx.files.map((f) => f.path));
  const aliases = await readAliases(ctx);
  const edges = new Map<string, Set<string>>();
  const loc = new Map<string, number>();
  const nodes: string[] = [];
  const typeReferenced = new Set<string>();
  let externalEdges = 0;
  let unresolved = 0;
  let n = 0;
  for (const sf of project.getSourceFiles()) {
    if (++n % 50 === 0) throwIfAborted(ctx.signal);
    const from = repoPathOf(sf.getFilePath());
    nodes.push(from);
    loc.set(from, sf.getEndLineNumber());
    const targets = edges.get(from) ?? new Set<string>();
    const specs: string[] = [];
    // Type-only imports are erased at runtime, so they do not create load-order coupling.
    const typeSpecs: string[] = [];
    for (const imp of sf.getImportDeclarations()) {
      const named = imp.getNamedImports();
      const typeOnly =
        imp.isTypeOnly() ||
        (named.length > 0 &&
          !imp.getDefaultImport() &&
          !imp.getNamespaceImport() &&
          named.every((n) => n.isTypeOnly()));
      (typeOnly ? typeSpecs : specs).push(imp.getModuleSpecifierValue());
    }
    for (const exp of sf.getExportDeclarations()) {
      const s = exp.getModuleSpecifierValue();
      if (s) (exp.isTypeOnly() ? typeSpecs : specs).push(s);
    }
    for (const spec of typeSpecs) {
      const r = resolveSpecifier(from, spec, files, aliases);
      if (r && r !== "external") typeReferenced.add(r);
    }
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = call.getExpression();
      const isDynamic = expr.getKind() === SyntaxKind.ImportKeyword;
      const isRequire = Node.isIdentifier(expr) && expr.getText() === "require";
      if (!isDynamic && !isRequire) continue;
      const arg = call.getArguments()[0];
      if (arg && Node.isStringLiteral(arg)) specs.push(arg.getLiteralValue());
    }
    for (const spec of specs) {
      const r = resolveSpecifier(from, spec, files, aliases);
      if (r === "external") externalEdges++;
      else if (r === null) unresolved++;
      else if (r !== from) targets.add(r);
    }
    edges.set(from, targets);
  }
  return { nodes: nodes.sort(), edges, externalEdges, unresolved, loc, typeReferenced };
}

/** Directory used for aggregation: two path segments deep (e.g. `src/components`), or the top level. */
export function moduleDirOf(file: string, depth = 2): string {
  const parts = file.split("/");
  if (parts.length <= 1) return "(root)";
  return parts.slice(0, Math.min(depth, parts.length - 1)).join("/");
}

export function buildArchitectureGraph(fg: FileGraph): ArchitectureGraph {
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  for (const [from, tos] of fg.edges) {
    fanOut.set(from, tos.size);
    for (const to of tos) fanIn.set(to, (fanIn.get(to) ?? 0) + 1);
  }
  const cycles = stronglyConnectedComponents(fg.nodes, fg.edges);
  const inCycleFile = new Set(cycles.flat());
  const cycleEdgeKey = new Set<string>();
  for (const comp of cycles) {
    const members = new Set(comp);
    for (const m of comp)
      for (const to of fg.edges.get(m) ?? [])
        if (members.has(to)) cycleEdgeKey.add(`${m}${SEP}${to}`);
  }

  const fileNodes: GraphNode[] = fg.nodes.map((path) => {
    const fi = fanIn.get(path) ?? 0;
    const fo = fanOut.get(path) ?? 0;
    return {
      path,
      kind: "file",
      parentPath: moduleDirOf(path),
      loc: fg.loc.get(path) ?? 0,
      fileCount: 1,
      fanIn: fi,
      fanOut: fo,
      instability: fi + fo === 0 ? null : Math.round((fo / (fi + fo)) * 1000) / 1000,
      inCycle: inCycleFile.has(path),
    };
  });
  const fileEdges: GraphEdge[] = [];
  for (const [from, tos] of fg.edges) {
    for (const to of tos)
      fileEdges.push({
        kind: "file",
        from,
        to,
        weight: 1,
        inCycle: cycleEdgeKey.has(`${from}${SEP}${to}`),
      });
  }

  // Directory aggregation.
  const dirLoc = new Map<string, number>();
  const dirFiles = new Map<string, number>();
  for (const f of fileNodes) {
    const d = f.parentPath ?? "(root)";
    dirLoc.set(d, (dirLoc.get(d) ?? 0) + f.loc);
    dirFiles.set(d, (dirFiles.get(d) ?? 0) + 1);
  }
  const dirEdgeWeight = new Map<string, number>();
  for (const e of fileEdges) {
    const a = moduleDirOf(e.from);
    const b = moduleDirOf(e.to);
    if (a === b) continue;
    const key = `${a}${SEP}${b}`;
    dirEdgeWeight.set(key, (dirEdgeWeight.get(key) ?? 0) + 1);
  }
  const dirNames = [...dirLoc.keys()].sort();
  // Directory-level cycles are derived from file-level ones: aggregating imports to directories
  // creates trivial back-and-forth edges (a/index -> b/util -> a/types) that are not real cycles.
  const inCycleDir = new Set<string>();
  const dirCycleEdges = new Set<string>();
  for (const key of cycleEdgeKey) {
    const [from, to] = key.split(SEP) as [string, string];
    const da = moduleDirOf(from);
    const db = moduleDirOf(to);
    inCycleDir.add(da);
    inCycleDir.add(db);
    if (da !== db) dirCycleEdges.add(`${da}${SEP}${db}`);
  }
  const dirFanIn = new Map<string, number>();
  const dirFanOut = new Map<string, number>();
  const dirEdges: GraphEdge[] = [];
  for (const [key, weight] of dirEdgeWeight) {
    const [from, to] = key.split(SEP) as [string, string];
    dirEdges.push({ kind: "dir", from, to, weight, inCycle: dirCycleEdges.has(key) });
    dirFanOut.set(from, (dirFanOut.get(from) ?? 0) + 1);
    dirFanIn.set(to, (dirFanIn.get(to) ?? 0) + 1);
  }
  const dirNodes: GraphNode[] = dirNames.map((path) => {
    const fi = dirFanIn.get(path) ?? 0;
    const fo = dirFanOut.get(path) ?? 0;
    const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : null;
    return {
      path,
      kind: "dir",
      parentPath: parent,
      loc: dirLoc.get(path) ?? 0,
      fileCount: dirFiles.get(path) ?? 0,
      fanIn: fi,
      fanOut: fo,
      instability: fi + fo === 0 ? null : Math.round((fo / (fi + fo)) * 1000) / 1000,
      inCycle: inCycleDir.has(path),
    };
  });
  return {
    fileNodes,
    fileEdges: fileEdges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
    dirNodes,
    dirEdges: dirEdges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
    cycles,
  };
}

export const architectureAnalyzer: Analyzer<ArchitectureMetrics> = {
  key: "architecture",
  critical: false,
  async run(ctx: AnalyzerContext): Promise<AnalyzerResult<ArchitectureMetrics>> {
    const fg = await buildFileGraph(ctx);
    const graph = buildArchitectureGraph(fg);
    const testPaths = new Set(ctx.files.filter((f) => f.isTest).map((f) => f.path));
    const findings = [];

    const cycles = graph.cycles.filter((c) => !c.every((p) => testPaths.has(p)));
    for (const cycle of cycles.slice(0, MAX_CYCLE_FINDINGS)) {
      const first = cycle[0] as string;
      findings.push(
        finding({
          ruleId: "arch/circular-dependency",
          category: "architecture",
          severity: cycle.length >= 3 ? "high" : "medium",
          title: `Circular dependency across ${pluralize(cycle.length, "file")}`,
          message: `${cycle.slice(0, 4).join(" → ")}${cycle.length > 4 ? ` → … (${cycle.length - 4} more)` : ""} import each other. Cycles couple modules so tightly that none can be changed, tested or loaded independently, and they cause undefined-at-import bugs in ESM.`,
          filePath: first,
          symbol: `cycle:${cycle.join("|").slice(0, 200)}`,
          evidence: { relatedPaths: cycle.slice(0, 50), data: { length: cycle.length } },
          recommendation:
            "Break the cycle by moving the shared piece into its own module that both sides import, or by inverting one dependency through an interface or callback.",
        }),
      );
    }

    const hubs = graph.fileNodes
      .filter((n) => n.fanIn >= HUB_MIN_FAN_IN && !testPaths.has(n.path))
      .sort((a, b) => b.fanIn - a.fanIn || a.path.localeCompare(b.path))
      .slice(0, 20);
    for (const h of hubs.slice(0, 10)) {
      // Small, stable hubs (types, constants, utils) are fine; flag when a hub is also unstable/large.
      if (h.loc < 150 && h.fanOut <= 3) continue;
      findings.push(
        finding({
          ruleId: "arch/hub-module",
          category: "architecture",
          severity: "medium",
          title: `${h.path} is imported by ${pluralize(h.fanIn, "module")}`,
          message: `${h.path} has fan-in ${h.fanIn}, fan-out ${h.fanOut} and ${pluralize(h.loc, "line")}. A large, widely imported module is a change amplifier: edits ripple through most of the codebase.`,
          filePath: h.path,
          symbol: "hub",
          evidence: {
            data: { fanIn: h.fanIn, fanOut: h.fanOut, loc: h.loc, instability: h.instability },
          },
          recommendation:
            "Split it into smaller, cohesive modules so consumers depend only on what they use, and keep it free of downstream imports.",
        }),
      );
    }
    const godFiles = graph.fileNodes
      .filter((n) => n.fanOut >= GOD_FILE_FAN_OUT && !testPaths.has(n.path))
      .sort((a, b) => b.fanOut - a.fanOut || a.path.localeCompare(b.path))
      .slice(0, 20);
    for (const g of godFiles.slice(0, 10)) {
      if (/(^|\/)index\.[cm]?[jt]sx?$/.test(g.path)) continue; // barrels re-export by design
      findings.push(
        finding({
          ruleId: "arch/god-file",
          category: "architecture",
          severity: "medium",
          title: `${g.path} imports ${pluralize(g.fanOut, "internal module")}`,
          message: `${g.path} depends on ${g.fanOut} other modules, which usually means it orchestrates too much and knows about every part of the system.`,
          filePath: g.path,
          symbol: "god-file",
          evidence: { data: { fanOut: g.fanOut, loc: g.loc } },
          recommendation:
            "Move orchestration into feature-level modules and have this file compose them through a narrow interface.",
        }),
      );
    }
    const orphanCandidates = graph.fileNodes.filter(
      (n) =>
        n.fanIn === 0 &&
        n.fanOut === 0 &&
        !fg.typeReferenced.has(n.path) &&
        !testPaths.has(n.path) &&
        !isAuxiliaryPath(n.path) &&
        !/(^|\/)(index|main|app|server|cli|page|layout|route|middleware|proxy|worker)\.[cm]?[jt]sx?$/.test(
          n.path,
        ) &&
        !/\.(config|d|stories|setup)\.[cm]?[jt]sx?$/.test(n.path) &&
        !/(^|\/)(scripts?|bin|tools?|examples?|docs?)\//.test(n.path) &&
        n.loc > 20,
    );
    for (const o of orphanCandidates.slice(0, 10)) {
      findings.push(
        finding({
          ruleId: "arch/orphan-file",
          category: "maintainability",
          severity: "info",
          title: `${o.path} is not connected to any other module`,
          message: `${o.path} neither imports nor is imported by any other source file in the repository, and does not match an entry-point pattern. It may be dead code.`,
          filePath: o.path,
          symbol: "orphan",
          recommendation: "Delete it if unused, or wire it in where it belongs.",
        }),
      );
    }

    const depths = graph.fileNodes.map((n) => n.path.split("/").length - 1);
    const metrics: ArchitectureMetrics = {
      fileNodes: graph.fileNodes.length,
      fileEdges: graph.fileEdges.length,
      dirNodes: graph.dirNodes.length,
      dirEdges: graph.dirEdges.length,
      externalEdges: fg.externalEdges,
      unresolvedImports: fg.unresolved,
      cycles: cycles
        .slice(0, 50)
        .map((paths) => ({ paths: paths.slice(0, 50), length: paths.length })),
      cycleCount: cycles.length,
      cycleFileCount: new Set(cycles.flat()).size,
      hubs: hubs.map((h) => ({ path: h.path, fanIn: h.fanIn })),
      godFiles: godFiles.map((g) => ({ path: g.path, fanOut: g.fanOut })),
      orphanFiles: orphanCandidates.length,
      avgFanOut: graph.fileNodes.length
        ? Math.round((graph.fileEdges.length / graph.fileNodes.length) * 100) / 100
        : 0,
      maxDepth: depths.length ? Math.max(...depths) : 0,
    };
    return {
      metrics,
      findings,
      detail: `${pluralize(graph.fileNodes.length, "module")}, ${pluralize(graph.fileEdges.length, "import edge")}, ${pluralize(cycles.length, "cycle")}`,
      extra: graph,
    };
  },
};
