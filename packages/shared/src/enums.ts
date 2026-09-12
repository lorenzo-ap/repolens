import { z } from "zod";

export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
export const SeveritySchema = z.enum(SEVERITIES);
export type Severity = z.infer<typeof SeveritySchema>;

/** Lower rank = more severe. Used for sorting and keyset pagination. */
export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export const CATEGORIES = [
  "quality",
  "complexity",
  "architecture",
  "dependencies",
  "testing",
  "maintainability",
  "gitHealth",
] as const;
export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;

export const CATEGORY_LABELS: Record<Category, string> = {
  quality: "Code quality",
  complexity: "Complexity",
  architecture: "Architecture",
  dependencies: "Dependencies",
  testing: "Testing",
  maintainability: "Maintainability",
  gitHealth: "Git health",
};

export const ANALYSIS_STATUSES = ["queued", "running", "completed", "failed", "cancelled"] as const;
export const AnalysisStatusSchema = z.enum(ANALYSIS_STATUSES);
export type AnalysisStatus = z.infer<typeof AnalysisStatusSchema>;

export const STEP_STATUSES = ["pending", "running", "completed", "failed", "skipped"] as const;
export const StepStatusSchema = z.enum(STEP_STATUSES);
export type StepStatus = z.infer<typeof StepStatusSchema>;

export const STEP_KEYS = [
  "clone",
  "structure",
  "typescript",
  "quality",
  "complexity",
  "dependencies",
  "architecture",
  "testing",
  "gitHistory",
  "scoring",
] as const;
export const StepKeySchema = z.enum(STEP_KEYS);
export type StepKey = z.infer<typeof StepKeySchema>;

export const STEP_LABELS: Record<StepKey, string> = {
  clone: "Clone repository",
  structure: "Repository structure",
  typescript: "TypeScript",
  quality: "Code quality",
  complexity: "Complexity",
  dependencies: "Dependencies",
  architecture: "Architecture",
  testing: "Testing",
  gitHistory: "Git history",
  scoring: "Health score",
};

export const GRADES = ["A", "B", "C", "D", "F"] as const;
export const GradeSchema = z.enum(GRADES);
export type Grade = z.infer<typeof GradeSchema>;

export function gradeForScore(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 65) return "C";
  if (score >= 50) return "D";
  return "F";
}

export function isActiveStatus(status: AnalysisStatus): boolean {
  return status === "queued" || status === "running";
}
