import { readFile } from "node:fs/promises";
import type { QualityMetrics } from "@repolens/shared";
import { Node, SyntaxKind } from "ts-morph";
import { collectFunctions, maxNestingDepth } from "../ast/functions";
import { repoPathOf } from "../ast/project";
import { finding, pluralize, snippet } from "../findings";
import type { Analyzer, AnalyzerContext, AnalyzerResult } from "../types";
import { throwIfAborted } from "../types";

export const LONG_FUNCTION_LINES = 60;
export const MAX_PARAMS = 5;
export const MAX_NESTING = 4;
const DUPLICATE_WINDOW = 6;
const MAX_PER_RULE = 100;

interface DuplicateOccurrence {
  file: string;
  line: number;
}

/** Lines that are too generic to indicate real duplication (braces, imports, blank). */
function normalizeLine(line: string): string | null {
  const t = line.trim();
  if (
    t === "" ||
    t === "}" ||
    t === "{" ||
    t === "};" ||
    t === ")" ||
    t === "});" ||
    t === "]" ||
    t === "],"
  )
    return null;
  if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return null;
  if (/^(import|export)\b/.test(t)) return null;
  return t.replace(/\s+/g, " ");
}

export const qualityAnalyzer: Analyzer<QualityMetrics> = {
  key: "quality",
  critical: false,
  async run(ctx: AnalyzerContext): Promise<AnalyzerResult<QualityMetrics>> {
    const project = ctx.getProject();
    const findings = [];
    const counts = {
      long: 0,
      params: 0,
      nesting: 0,
      emptyCatch: 0,
      consoleLog: 0,
      todo: 0,
      fixme: 0,
      commentedOut: 0,
    };
    const perRule: Record<string, number> = {};
    const push = (ruleId: string, f: ReturnType<typeof finding>) => {
      perRule[ruleId] = (perRule[ruleId] ?? 0) + 1;
      if ((perRule[ruleId] ?? 0) <= MAX_PER_RULE) findings.push(f);
    };
    const testFiles = new Set(ctx.files.filter((f) => f.isTest).map((f) => f.path));
    let n = 0;

    for (const sf of project.getSourceFiles()) {
      if (++n % 50 === 0) throwIfAborted(ctx.signal);
      const file = repoPathOf(sf.getFilePath());
      const isTest = testFiles.has(file);

      for (const fn of collectFunctions(sf)) {
        if (isTest) continue;
        if (fn.loc > LONG_FUNCTION_LINES) {
          counts.long++;
          push(
            "quality/long-function",
            finding({
              ruleId: "quality/long-function",
              category: "quality",
              severity: fn.loc > LONG_FUNCTION_LINES * 3 ? "high" : "medium",
              title: `${fn.name} spans ${pluralize(fn.loc, "line")}`,
              message: `${fn.name} is ${fn.loc} lines long (threshold ${LONG_FUNCTION_LINES}). Long functions mix several responsibilities and are expensive to test in isolation.`,
              filePath: file,
              line: fn.line,
              endLine: fn.endLine,
              symbol: fn.name,
              evidence: { data: { lines: fn.loc, threshold: LONG_FUNCTION_LINES } },
              recommendation: "Split the function into smaller units named after what they do.",
            }),
          );
        }
        if (fn.parameterCount > MAX_PARAMS) {
          counts.params++;
          push(
            "quality/too-many-params",
            finding({
              ruleId: "quality/too-many-params",
              category: "quality",
              severity: "low",
              title: `${fn.name} takes ${pluralize(fn.parameterCount, "parameter")}`,
              message: `${fn.name} declares ${fn.parameterCount} parameters (threshold ${MAX_PARAMS}). Call sites become error-prone and positional.`,
              filePath: file,
              line: fn.line,
              symbol: fn.name,
              evidence: { data: { parameters: fn.parameterCount, threshold: MAX_PARAMS } },
              recommendation: "Group related parameters into an options object or a typed struct.",
            }),
          );
        }
        const depth = maxNestingDepth(fn.node);
        if (depth > MAX_NESTING) {
          counts.nesting++;
          push(
            "quality/deep-nesting",
            finding({
              ruleId: "quality/deep-nesting",
              category: "quality",
              severity: "medium",
              title: `Control flow nested ${depth} levels deep in ${fn.name}`,
              message: `${fn.name} nests blocks ${depth} levels deep (threshold ${MAX_NESTING}).`,
              filePath: file,
              line: fn.line,
              endLine: fn.endLine,
              symbol: fn.name,
              evidence: { data: { depth, threshold: MAX_NESTING } },
              recommendation:
                "Use early returns, extract inner loops, and flatten conditional chains.",
            }),
          );
        }
      }

      for (const clause of sf.getDescendantsOfKind(SyntaxKind.CatchClause)) {
        const block = clause.getBlock();
        const hasStatements = block.getStatements().length > 0;
        const hasComment = block.getText().includes("//") || block.getText().includes("/*");
        if (!hasStatements && !hasComment) {
          counts.emptyCatch++;
          if (isTest) continue;
          push(
            "quality/empty-catch",
            finding({
              ruleId: "quality/empty-catch",
              category: "quality",
              severity: "high",
              title: "Empty catch block swallows errors",
              message: `A catch block at ${file}:${clause.getStartLineNumber()} has no body and no comment, so failures disappear silently.`,
              filePath: file,
              line: clause.getStartLineNumber(),
              symbol: `catch:${clause.getStartLineNumber()}`,
              evidence: { snippet: snippet(clause.getParent().getText(), 8) },
              recommendation:
                "Handle the error, rethrow it, or log it with context. If ignoring is intentional, say why in a comment.",
            }),
          );
        }
      }

      let fileConsole = 0;
      let firstConsoleLine = 0;
      for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        const expr = call.getExpression();
        if (Node.isPropertyAccessExpression(expr) && expr.getExpression().getText() === "console") {
          const method = expr.getName();
          if (method === "log" || method === "debug") {
            fileConsole++;
            if (!firstConsoleLine) firstConsoleLine = call.getStartLineNumber();
          }
        }
      }
      counts.consoleLog += fileConsole;
      if (
        fileConsole > 0 &&
        !isTest &&
        !/(^|\/)(scripts?|bin|cli|tools?)\//.test(file) &&
        !/\.config\./.test(file)
      ) {
        push(
          "quality/console-log",
          finding({
            ruleId: "quality/console-log",
            category: "quality",
            severity: "low",
            title: `${pluralize(fileConsole, "console.log call")}`,
            message: `${file} calls console.log/console.debug ${fileConsole} time(s). Unstructured logging leaks into production output and cannot be filtered.`,
            filePath: file,
            line: firstConsoleLine,
            symbol: "console.log",
            evidence: { data: { count: fileConsole } },
            recommendation: "Use a structured logger with levels, or remove debugging output.",
          }),
        );
      }
    }

    // Text-based checks run over all text source files (including those skipped by the AST for size).
    const hashes = new Map<string, DuplicateOccurrence[]>();
    let duplicatedLines = 0;
    let totalSourceLines = 0;
    let duplicateBlocks = 0;
    const dupReported = new Set<string>();

    for (const f of ctx.files) {
      if (!f.isSource || f.isTest) continue;
      if (++n % 50 === 0) throwIfAborted(ctx.signal);
      let text: string;
      try {
        text = await readFile(f.absolutePath, "utf8");
      } catch {
        continue;
      }
      const lines = text.split("\n");
      totalSourceLines += lines.length;

      let commentRun = 0;
      let codeLikeInRun = 0;
      for (let i = 0; i < lines.length; i++) {
        const raw = lines[i] ?? "";
        const t = raw.trim();
        if (/\b(TODO|HACK|XXX)\b/.test(t) && /(\/\/|\/\*|\*|#)/.test(t)) counts.todo++;
        if (/\bFIXME\b/.test(t) && /(\/\/|\/\*|\*)/.test(t)) {
          counts.fixme++;
          push(
            "quality/fixme",
            finding({
              ruleId: "quality/fixme",
              category: "maintainability",
              severity: "low",
              title: "FIXME left in code",
              message: `${f.path}:${i + 1} carries a FIXME marker: ${t.slice(0, 120)}`,
              filePath: f.path,
              line: i + 1,
              symbol: `fixme:${i + 1}`,
              evidence: { snippet: snippet(raw, 1) },
              recommendation:
                "Resolve the marked problem or turn it into a tracked issue and remove the marker.",
            }),
          );
        }
        if (t.startsWith("//")) {
          commentRun++;
          const body = t.slice(2).trim();
          if (
            /[;{}]$/.test(body) ||
            /^(const|let|var|return|if|for|import|export|function)\b/.test(body)
          )
            codeLikeInRun++;
        } else {
          if (commentRun >= 3 && codeLikeInRun >= 3) counts.commentedOut++;
          commentRun = 0;
          codeLikeInRun = 0;
        }
      }
      if (commentRun >= 3 && codeLikeInRun >= 3) counts.commentedOut++;

      // Rolling window exact-duplicate detection over normalized lines.
      const normalized: Array<{ text: string; line: number }> = [];
      for (let i = 0; i < lines.length; i++) {
        const norm = normalizeLine(lines[i] ?? "");
        if (norm !== null) normalized.push({ text: norm, line: i + 1 });
      }
      for (let i = 0; i + DUPLICATE_WINDOW <= normalized.length; i++) {
        const window = normalized.slice(i, i + DUPLICATE_WINDOW);
        const key = window.map((w) => w.text).join("\n");
        if (key.length < 120) continue; // too little content to be meaningful
        const list = hashes.get(key) ?? [];
        list.push({ file: f.path, line: window[0]?.line ?? 1 });
        hashes.set(key, list);
      }
    }

    for (const [key, occurrences] of hashes) {
      if (occurrences.length < 2) continue;
      // Skip overlapping windows in the same file region, which would over-count one long duplicate.
      const distinct = occurrences.filter(
        (o, idx) =>
          !occurrences
            .slice(0, idx)
            .some((p) => p.file === o.file && Math.abs(p.line - o.line) < DUPLICATE_WINDOW),
      );
      if (distinct.length < 2) continue;
      const first = distinct[0];
      if (!first) continue;
      const groupKey = `${first.file}:${Math.floor(first.line / DUPLICATE_WINDOW)}`;
      if (dupReported.has(groupKey)) continue;
      dupReported.add(groupKey);
      duplicateBlocks++;
      duplicatedLines += DUPLICATE_WINDOW * (distinct.length - 1);
      const others = distinct.slice(1);
      push(
        "quality/duplicate-block",
        finding({
          ruleId: "quality/duplicate-block",
          category: "maintainability",
          severity: "medium",
          title: `Duplicated block appears ${distinct.length} times`,
          message: `A ${DUPLICATE_WINDOW}-line block starting at ${first.file}:${first.line} is repeated at ${others
            .slice(0, 3)
            .map((o) => `${o.file}:${o.line}`)
            .join(", ")}${others.length > 3 ? ` and ${others.length - 3} more` : ""}.`,
          filePath: first.file,
          line: first.line,
          endLine: first.line + DUPLICATE_WINDOW - 1,
          symbol: `dup:${first.line}`,
          evidence: {
            snippet: snippet(key, DUPLICATE_WINDOW),
            relatedPaths: others.map((o) => `${o.file}:${o.line}`),
            data: { occurrences: distinct.length },
          },
          recommendation: "Extract the shared logic into a function or module and reuse it.",
        }),
      );
    }

    const paths = new Set(ctx.files.map((f) => f.path));
    const has = (...names: string[]) => names.some((nm) => paths.has(nm));
    const eslint = has(
      ".eslintrc",
      ".eslintrc.js",
      ".eslintrc.cjs",
      ".eslintrc.json",
      ".eslintrc.yml",
      ".eslintrc.yaml",
      "eslint.config.js",
      "eslint.config.mjs",
      "eslint.config.cjs",
      "eslint.config.ts",
      "eslint.config.mts",
    );
    const biome = has("biome.json", "biome.jsonc");
    const prettier = has(
      ".prettierrc",
      ".prettierrc.json",
      ".prettierrc.js",
      ".prettierrc.cjs",
      ".prettierrc.mjs",
      ".prettierrc.yml",
      ".prettierrc.yaml",
      ".prettierrc.toml",
      "prettier.config.js",
      "prettier.config.cjs",
      "prettier.config.mjs",
    );
    const lintConfig: QualityMetrics["lintConfig"] =
      eslint && biome ? "both" : eslint ? "eslint" : biome ? "biome" : "none";
    const formatterConfig: QualityMetrics["formatterConfig"] =
      prettier && biome ? "both" : prettier ? "prettier" : biome ? "biome" : "none";
    const sourceFiles = ctx.files.filter((f) => f.isSource).length;
    if (lintConfig === "none" && sourceFiles > 0) {
      findings.push(
        finding({
          ruleId: "quality/no-linter",
          category: "quality",
          severity: "medium",
          title: "No linter configuration found",
          message:
            "Neither an ESLint nor a Biome configuration exists, so common mistakes are not caught before review.",
          recommendation: "Add Biome or ESLint with a recommended rule set and run it in CI.",
        }),
      );
    }

    const metrics: QualityMetrics = {
      todoCount: counts.todo,
      fixmeCount: counts.fixme,
      consoleLogCount: counts.consoleLog,
      longFunctions: counts.long,
      longParameterLists: counts.params,
      deepNesting: counts.nesting,
      emptyCatchBlocks: counts.emptyCatch,
      duplicateBlocks,
      duplicatedLines,
      duplicationRatio:
        totalSourceLines > 0 ? Math.round((duplicatedLines / totalSourceLines) * 10000) / 10000 : 0,
      commentedOutCodeBlocks: counts.commentedOut,
      lintConfig,
      formatterConfig,
    };

    return {
      metrics,
      findings,
      detail: `${pluralize(counts.long, "long function")}, ${pluralize(duplicateBlocks, "duplicate block")}, ${pluralize(counts.emptyCatch, "empty catch")}`,
    };
  },
};
