import type { ComplexityMetrics, FunctionComplexity } from "@repolens/shared";
import {
  cognitiveComplexity,
  collectFunctions,
  cyclomaticComplexity,
  percentile,
  round,
} from "../ast/functions";
import { repoPathOf } from "../ast/project";
import { finding, pluralize, snippet } from "../findings";
import type { Analyzer, AnalyzerContext, AnalyzerResult } from "../types";
import { throwIfAborted } from "../types";

export const CYCLOMATIC_MEDIUM = 15;
export const CYCLOMATIC_HIGH = 30;
export const COGNITIVE_MEDIUM = 20;
export const COGNITIVE_HIGH = 40;
const MAX_FINDINGS = 150;

export const complexityAnalyzer: Analyzer<ComplexityMetrics> = {
  key: "complexity",
  critical: false,
  async run(ctx: AnalyzerContext): Promise<AnalyzerResult<ComplexityMetrics>> {
    const project = ctx.getProject();
    const all: FunctionComplexity[] = [];
    const perFile = new Map<string, { sumCyclomatic: number; functions: number }>();
    const findings = [];
    let i = 0;

    for (const sf of project.getSourceFiles()) {
      if (++i % 50 === 0) throwIfAborted(ctx.signal);
      const file = repoPathOf(sf.getFilePath());
      const isTest = ctx.files.find((f) => f.path === file)?.isTest ?? false;
      for (const fn of collectFunctions(sf)) {
        const cyclomatic = cyclomaticComplexity(fn.node);
        const cognitive = cognitiveComplexity(fn.node);
        all.push({ file, name: fn.name, line: fn.line, cyclomatic, cognitive, loc: fn.loc });
        const agg = perFile.get(file) ?? { sumCyclomatic: 0, functions: 0 };
        agg.sumCyclomatic += cyclomatic;
        agg.functions++;
        perFile.set(file, agg);
        if (isTest) continue;
        if (cyclomatic > CYCLOMATIC_MEDIUM) {
          findings.push(
            finding({
              ruleId: "complexity/high-cyclomatic",
              category: "complexity",
              severity: cyclomatic > CYCLOMATIC_HIGH ? "high" : "medium",
              title: `Cyclomatic complexity ${cyclomatic} in ${fn.name}`,
              message: `${fn.name} has ${cyclomatic} independent paths (threshold ${CYCLOMATIC_MEDIUM}). Each path needs its own test case and the function is hard to reason about as a whole.`,
              filePath: file,
              line: fn.line,
              endLine: fn.endLine,
              symbol: fn.name,
              evidence: {
                snippet: snippet(fn.node.getText(), 6),
                data: { cyclomatic, cognitive, loc: fn.loc, threshold: CYCLOMATIC_MEDIUM },
              },
              recommendation:
                "Extract branches into named helper functions, replace conditionals with lookup tables or polymorphism, and return early to flatten the flow.",
            }),
          );
        } else if (cognitive > COGNITIVE_MEDIUM) {
          findings.push(
            finding({
              ruleId: "complexity/high-cognitive",
              category: "complexity",
              severity: cognitive > COGNITIVE_HIGH ? "high" : "medium",
              title: `Cognitive complexity ${cognitive} in ${fn.name}`,
              message: `${fn.name} scores ${cognitive} on cognitive complexity (threshold ${COGNITIVE_MEDIUM}), mostly from nested control flow. Readers must hold many nested conditions in their head at once.`,
              filePath: file,
              line: fn.line,
              endLine: fn.endLine,
              symbol: fn.name,
              evidence: {
                snippet: snippet(fn.node.getText(), 6),
                data: { cyclomatic, cognitive, loc: fn.loc, threshold: COGNITIVE_MEDIUM },
              },
              recommendation:
                "Reduce nesting with guard clauses, split nested loops into helpers, and simplify compound boolean conditions.",
            }),
          );
        }
      }
    }

    const cyclo = all.map((f) => f.cyclomatic).sort((a, b) => a - b);
    const cogn = all.map((f) => f.cognitive).sort((a, b) => a - b);
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const distribution = { "1-5": 0, "6-10": 0, "11-20": 0, "21-50": 0, "51+": 0 };
    for (const c of cyclo) {
      if (c <= 5) distribution["1-5"]++;
      else if (c <= 10) distribution["6-10"]++;
      else if (c <= 20) distribution["11-20"]++;
      else if (c <= 50) distribution["21-50"]++;
      else distribution["51+"]++;
    }

    const metrics: ComplexityMetrics = {
      functions: all.length,
      avgCyclomatic: all.length ? round(sum(cyclo) / all.length) : 0,
      p90Cyclomatic: percentile(cyclo, 90),
      maxCyclomatic: cyclo[cyclo.length - 1] ?? 0,
      avgCognitive: all.length ? round(sum(cogn) / all.length) : 0,
      p90Cognitive: percentile(cogn, 90),
      maxCognitive: cogn[cogn.length - 1] ?? 0,
      topFunctions: [...all]
        .sort(
          (a, b) =>
            b.cyclomatic - a.cyclomatic ||
            b.cognitive - a.cognitive ||
            a.file.localeCompare(b.file) ||
            a.line - b.line,
        )
        .slice(0, 25),
      fileComplexity: [...perFile.entries()]
        .map(([file, v]) => ({ file, ...v }))
        .sort((a, b) => b.sumCyclomatic - a.sumCyclomatic || a.file.localeCompare(b.file))
        .slice(0, 100),
      distribution,
    };

    findings.sort((a, b) => {
      const ac = Number(a.evidence.data?.cyclomatic ?? 0);
      const bc = Number(b.evidence.data?.cyclomatic ?? 0);
      return bc - ac;
    });

    return {
      metrics,
      findings: findings.slice(0, MAX_FINDINGS),
      detail: `${pluralize(all.length, "function")}, avg cyclomatic ${metrics.avgCyclomatic}, max ${metrics.maxCyclomatic}`,
    };
  },
};
