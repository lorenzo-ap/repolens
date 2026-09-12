import type { Category, FindingEvidence, FindingInput, Severity } from "@repolens/shared";

export interface FindingSpec {
  ruleId: string;
  category: Category;
  severity: Severity;
  title: string;
  message: string;
  filePath?: string | null;
  line?: number | null;
  endLine?: number | null;
  symbol?: string | null;
  evidence?: FindingEvidence;
  recommendation: string;
}

export function finding(spec: FindingSpec): FindingInput {
  return {
    ruleId: spec.ruleId,
    category: spec.category,
    severity: spec.severity,
    title: truncate(spec.title, 200),
    message: truncate(spec.message, 2000),
    filePath: spec.filePath ?? null,
    line: spec.line ?? null,
    endLine: spec.endLine ?? null,
    symbol: spec.symbol ?? null,
    evidence: spec.evidence ?? {},
    recommendation: truncate(spec.recommendation, 2000),
  };
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Trims a code snippet for evidence: at most `maxLines` lines and `maxCols` columns per line. */
export function snippet(text: string, maxLines = 8, maxCols = 160): string {
  const lines = text
    .split("\n")
    .slice(0, maxLines)
    .map((l) => truncate(l.replace(/\t/g, "  "), maxCols));
  return lines.join("\n");
}

export function pluralize(n: number, singular: string, plural = `${singular}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? singular : plural}`;
}

/** Keeps at most `max` findings, preferring the most severe ones, stable within a severity. */
export function capFindings(list: FindingInput[], max: number): FindingInput[] {
  if (list.length <= max) return list;
  const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  return list
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rank[a.f.severity] - rank[b.f.severity] || a.i - b.i)
    .slice(0, max)
    .map((x) => x.f);
}
