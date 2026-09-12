import type { TypeScriptMetrics } from "@repolens/shared";
import { Node, SyntaxKind, ts } from "ts-morph";
import { repoPathOf } from "../ast/project";
import { finding, pluralize, snippet } from "../findings";
import { readTextFile } from "../fs/enumerate";
import { isDeclarationFile, isTypeScriptExtension } from "../fs/languages";
import type { Analyzer, AnalyzerContext, AnalyzerResult } from "../types";
import { throwIfAborted } from "../types";

const ANY_PER_FILE_THRESHOLD = 3;
const NON_NULL_PER_FILE_THRESHOLD = 5;
const MAX_UNUSED_EXPORT_FINDINGS = 50;
const MAX_TS_IGNORE_FINDINGS = 100;

interface TsConfigFacts {
  present: boolean;
  strict: boolean | null;
  strictNullChecks: boolean | null;
  noImplicitAny: boolean | null;
}

/** Reads compiler options from tsconfig.json as data (JSON with comments) and follows local `extends`. */
export async function readTsConfigFacts(
  rootDir: string,
  files: Set<string>,
): Promise<TsConfigFacts> {
  const candidates = ["tsconfig.json", "tsconfig.base.json"];
  const start = candidates.find((c) => files.has(c));
  if (!start) return { present: false, strict: null, strictNullChecks: null, noImplicitAny: null };
  const merged: Record<string, unknown> = {};
  const seen = new Set<string>();
  let current: string | undefined = start;
  const chain: Record<string, unknown>[] = [];
  while (current && !seen.has(current) && chain.length < 10) {
    seen.add(current);
    const text = await readTextFile(rootDir, current);
    if (!text) break;
    const parsed = ts.parseConfigFileTextToJson(current, text);
    const config = (parsed.config ?? {}) as {
      extends?: unknown;
      compilerOptions?: Record<string, unknown>;
    };
    chain.push(config.compilerOptions ?? {});
    const ext =
      typeof config.extends === "string"
        ? config.extends
        : Array.isArray(config.extends)
          ? config.extends[0]
          : undefined;
    if (typeof ext === "string" && (ext.startsWith("./") || ext.startsWith("../"))) {
      const dir = current.includes("/") ? current.slice(0, current.lastIndexOf("/")) : "";
      const segments = [...(dir ? dir.split("/") : []), ...ext.split("/")];
      const out: string[] = [];
      for (const s of segments) {
        if (s === "." || s === "") continue;
        if (s === "..") out.pop();
        else out.push(s);
      }
      let next = out.join("/");
      if (!next.endsWith(".json")) next += ".json";
      current = files.has(next) ? next : undefined;
    } else current = undefined;
  }
  // The most-derived config wins, so apply from base to derived.
  for (const opts of chain.reverse()) Object.assign(merged, opts);
  const bool = (k: string): boolean | null =>
    typeof merged[k] === "boolean" ? (merged[k] as boolean) : null;
  const strict = bool("strict");
  return {
    present: true,
    strict,
    strictNullChecks: bool("strictNullChecks") ?? strict,
    noImplicitAny: bool("noImplicitAny") ?? strict,
  };
}

const ENTRY_POINT_RE =
  /(^|\/)(index|main|app|server|cli)\.[cm]?[jt]sx?$|(^|\/)(app|pages)\/.*\.[jt]sx$|(^|\/)(route|layout|page|loading|error|not-found|middleware|proxy|instrumentation)\.[jt]sx?$/;

export const typescriptAnalyzer: Analyzer<TypeScriptMetrics> = {
  key: "typescript",
  critical: false,
  async run(ctx: AnalyzerContext): Promise<AnalyzerResult<TypeScriptMetrics>> {
    const project = ctx.getProject();
    const allPaths = new Set(ctx.files.map((f) => f.path));
    const tsconfig = await readTsConfigFacts(ctx.rootDir, allPaths);
    const tsFiles = ctx.files.filter((f) => f.isSource && isTypeScriptExtension(f.ext)).length;
    const jsFiles = ctx.files.filter((f) => f.isSource && !isTypeScriptExtension(f.ext)).length;
    const findings = [];

    let anyCount = 0;
    let tsIgnoreCount = 0;
    let tsExpectErrorCount = 0;
    let nonNullAssertionCount = 0;
    let typeAssertionCount = 0;
    let enumCount = 0;
    let exportedSymbols = 0;
    let tsIgnoreFindings = 0;

    // Exported declaration names per file, and every imported (file, name) pair.
    const exportsByFile = new Map<string, Map<string, number>>(); // name -> line
    const importedNames = new Set<string>(); // `${file}#${name}`
    const wholeModuleImported = new Set<string>(); // files imported via namespace/side-effect/re-export-all
    let n = 0;

    for (const sf of project.getSourceFiles()) {
      if (++n % 50 === 0) throwIfAborted(ctx.signal);
      const file = repoPathOf(sf.getFilePath());
      const isTs = isTypeScriptExtension(sf.getFilePath().split(".").pop() ?? "");
      let fileAny = 0;
      let fileNonNull = 0;

      sf.forEachDescendant((node) => {
        const kind = node.getKind();
        if (kind === SyntaxKind.AnyKeyword) {
          // Count only explicit annotations, not the keyword inside JSDoc or strings.
          const parent = node.getParent();
          if (parent && !Node.isJSDoc(parent)) fileAny++;
        } else if (kind === SyntaxKind.NonNullExpression) fileNonNull++;
        else if (kind === SyntaxKind.AsExpression) {
          const asExpr = node.asKindOrThrow(SyntaxKind.AsExpression);
          const typeText = asExpr.getTypeNode()?.getText();
          if (typeText !== "const" && typeText !== "unknown") typeAssertionCount++;
        } else if (kind === SyntaxKind.EnumDeclaration) enumCount++;
      });

      for (const comment of sf.getDescendantsOfKind(SyntaxKind.SingleLineCommentTrivia)) {
        const text = comment.getText();
        if (/@ts-ignore/.test(text)) {
          tsIgnoreCount++;
          if (tsIgnoreFindings < MAX_TS_IGNORE_FINDINGS) {
            tsIgnoreFindings++;
            findings.push(
              finding({
                ruleId: "ts/ts-ignore",
                category: "quality",
                severity: "medium",
                title: "@ts-ignore suppresses a type error",
                message: `A @ts-ignore comment hides a type error at ${file}:${comment.getStartLineNumber()}. The suppressed error can silently change meaning when the code around it evolves.`,
                filePath: file,
                line: comment.getStartLineNumber(),
                symbol: `ts-ignore:${comment.getStartLineNumber()}`,
                evidence: { snippet: snippet(text, 2) },
                recommendation:
                  "Fix the underlying type error, or replace with @ts-expect-error plus a reason so the suppression fails when it is no longer needed.",
              }),
            );
          }
        } else if (/@ts-expect-error/.test(text)) tsExpectErrorCount++;
      }

      anyCount += fileAny;
      nonNullAssertionCount += fileNonNull;
      if (isTs && fileAny > ANY_PER_FILE_THRESHOLD) {
        findings.push(
          finding({
            ruleId: "ts/explicit-any",
            category: "quality",
            severity: "low",
            title: `${pluralize(fileAny, "explicit any annotation")}`,
            message: `${file} uses \`any\` ${fileAny} times, disabling type checking wherever those values flow.`,
            filePath: file,
            symbol: "any",
            evidence: { data: { count: fileAny, threshold: ANY_PER_FILE_THRESHOLD } },
            recommendation:
              "Replace `any` with `unknown` plus narrowing, generics, or precise types. Enable `noImplicitAny` to stop new ones.",
          }),
        );
      }
      if (fileNonNull > NON_NULL_PER_FILE_THRESHOLD) {
        findings.push(
          finding({
            ruleId: "ts/non-null-assertion-density",
            category: "quality",
            severity: "low",
            title: `${pluralize(fileNonNull, "non-null assertion")}`,
            message: `${file} contains ${fileNonNull} non-null assertions (\`!\`). Each one is an unchecked assumption that can throw at runtime.`,
            filePath: file,
            symbol: "non-null",
            evidence: { data: { count: fileNonNull, threshold: NON_NULL_PER_FILE_THRESHOLD } },
            recommendation:
              "Narrow with explicit checks, use optional chaining, or restructure so the value is provably defined.",
          }),
        );
      }

      // Export/import bookkeeping for unused-export detection.
      const exported = new Map<string, number>();
      for (const [name, decls] of sf.getExportedDeclarations()) {
        const first = decls[0];
        if (!first) continue;
        // Only count declarations that live in this file (not re-exports from elsewhere).
        if (repoPathOf(first.getSourceFile().getFilePath()) !== file) continue;
        exported.set(name, first.getStartLineNumber());
      }
      exportedSymbols += exported.size;
      exportsByFile.set(file, exported);

      for (const imp of sf.getImportDeclarations()) {
        const spec = imp.getModuleSpecifierValue();
        const target = resolveRelative(file, spec, allPaths);
        if (!target) continue;
        if (imp.getNamespaceImport() || imp.getNamedImports().length === 0)
          wholeModuleImported.add(target);
        if (imp.getDefaultImport()) importedNames.add(`${target}#default`);
        for (const named of imp.getNamedImports())
          importedNames.add(`${target}#${named.getName()}`);
      }
      for (const exp of sf.getExportDeclarations()) {
        const spec = exp.getModuleSpecifierValue();
        if (!spec) continue;
        const target = resolveRelative(file, spec, allPaths);
        if (!target) continue;
        if (exp.isNamespaceExport() || exp.getNamedExports().length === 0)
          wholeModuleImported.add(target);
        for (const named of exp.getNamedExports())
          importedNames.add(`${target}#${named.getName()}`);
      }
      // Dynamic imports and require() calls count as whole-module usage.
      for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        const expr = call.getExpression();
        const isDynamic = expr.getKind() === SyntaxKind.ImportKeyword;
        const isRequire = Node.isIdentifier(expr) && expr.getText() === "require";
        if (!isDynamic && !isRequire) continue;
        const arg = call.getArguments()[0];
        if (arg && Node.isStringLiteral(arg)) {
          const target = resolveRelative(file, arg.getLiteralValue(), allPaths);
          if (target) wholeModuleImported.add(target);
        }
      }
    }

    let unusedExports = 0;
    let unusedFindings = 0;
    const packageRoots = packageEntryFiles(ctx.files.map((f) => f.path));
    for (const [file, exported] of exportsByFile) {
      if (wholeModuleImported.has(file)) continue;
      if (isDeclarationFile(file) || ENTRY_POINT_RE.test(file) || packageRoots.has(file)) continue;
      const isTest = ctx.files.find((f) => f.path === file)?.isTest;
      if (isTest) continue;
      for (const [name, line] of exported) {
        if (importedNames.has(`${file}#${name}`)) continue;
        unusedExports++;
        if (unusedFindings < MAX_UNUSED_EXPORT_FINDINGS) {
          unusedFindings++;
          findings.push(
            finding({
              ruleId: "ts/unused-export",
              category: "maintainability",
              severity: "low",
              title: `Unused export: ${name}`,
              message: `\`${name}\` is exported from ${file} but never imported anywhere in the repository. Dead exports widen the public surface and hide code that could be deleted.`,
              filePath: file,
              line,
              symbol: name,
              recommendation:
                "Remove the export (or the declaration) if it is not part of a published package API; if it is, document it as public.",
            }),
          );
        }
      }
    }

    if (tsconfig.present && tsconfig.strict === false) {
      findings.push(
        finding({
          ruleId: "ts/strict-disabled",
          category: "quality",
          severity: "high",
          title: "TypeScript strict mode is disabled",
          message:
            "tsconfig.json sets `strict: false`. Null checks, implicit any and other core guarantees are off, so the compiler catches far fewer bugs.",
          filePath: "tsconfig.json",
          symbol: "strict",
          recommendation:
            "Enable `strict: true` and fix the resulting errors incrementally, starting with `strictNullChecks`.",
        }),
      );
    } else if (tsconfig.present && tsconfig.strict === null && tsFiles > 0) {
      findings.push(
        finding({
          ruleId: "ts/strict-disabled",
          category: "quality",
          severity: "medium",
          title: "TypeScript strict mode is not enabled",
          message:
            "tsconfig.json does not set `strict`, so it defaults to off. Null checks and implicit any detection are disabled.",
          filePath: "tsconfig.json",
          symbol: "strict",
          recommendation: 'Add `"strict": true` to compilerOptions.',
        }),
      );
    }

    const metrics: TypeScriptMetrics = {
      tsFiles,
      jsFiles,
      parsedFiles: project.getSourceFiles().length,
      skippedLargeFiles: ctx.files.filter((f) => f.isSource && f.size > 1024 * 1024).length,
      hasTsConfig: tsconfig.present,
      strictMode: tsconfig.strict,
      strictNullChecks: tsconfig.strictNullChecks,
      noImplicitAny: tsconfig.noImplicitAny,
      anyCount,
      tsIgnoreCount,
      tsExpectErrorCount,
      nonNullAssertionCount,
      typeAssertionCount,
      enumCount,
      exportedSymbols,
      unusedExports,
    };

    return {
      metrics,
      findings,
      detail: `${pluralize(tsFiles, "TS file")}, ${pluralize(jsFiles, "JS file")}, ${pluralize(anyCount, "explicit any")}, ${pluralize(unusedExports, "unused export")}`,
    };
  },
};

const RESOLVE_EXTS = ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"];

/** Resolves a relative specifier to a repository path, trying extensions and index files. */
export function resolveRelative(fromFile: string, spec: string, files: Set<string>): string | null {
  if (!spec.startsWith(".")) return null;
  const dir = fromFile.includes("/") ? fromFile.slice(0, fromFile.lastIndexOf("/")) : "";
  const segments = [...(dir ? dir.split("/") : []), ...spec.split("/")];
  const out: string[] = [];
  for (const s of segments) {
    if (s === "." || s === "") continue;
    if (s === "..") out.pop();
    else out.push(s);
  }
  const base = out.join("/");
  return resolveBase(base, files);
}

export function resolveBase(base: string, files: Set<string>): string | null {
  if (files.has(base) && /\.[cm]?[jt]sx?$/.test(base)) return base;
  // `./foo.js` written for ESM output that maps to `./foo.ts`
  const stripped = base.replace(/\.(js|jsx|mjs|cjs)$/, "");
  const candidates = [base, stripped];
  for (const c of candidates) {
    for (const ext of RESOLVE_EXTS) {
      const p = `${c}.${ext}`;
      if (files.has(p)) return p;
    }
  }
  for (const ext of RESOLVE_EXTS) {
    const p = `${base}/index.${ext}`;
    if (files.has(p)) return p;
  }
  return null;
}

/** Files referenced as package entry points (main/module/types/exports) by any package.json. */
function packageEntryFiles(paths: string[]): Set<string> {
  // Entry files are resolved lazily by name pattern to avoid reading manifests here; the
  // dependencies analyzer reads manifests. Treat `src/index.*` at any package root as public.
  const result = new Set<string>();
  const pkgDirs = paths
    .filter((p) => p.endsWith("package.json"))
    .map((p) => p.slice(0, -"package.json".length));
  for (const p of paths) {
    for (const dir of pkgDirs) {
      if (p.startsWith(dir) && /^(src\/|lib\/)?index\.[cm]?[jt]sx?$/.test(p.slice(dir.length)))
        result.add(p);
    }
  }
  return result;
}
