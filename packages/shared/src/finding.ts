import { z } from "zod";
import { CategorySchema, SeveritySchema } from "./enums";

export const FindingEvidenceSchema = z.object({
  /** Short code excerpt or textual evidence, already truncated by the analyzer. */
  snippet: z.string().optional(),
  /** Structured, rule-specific facts (e.g. { cyclomatic: 32, threshold: 15 }). */
  data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  /** Additional related file paths (e.g. members of a dependency cycle). */
  relatedPaths: z.array(z.string()).optional(),
});
export type FindingEvidence = z.infer<typeof FindingEvidenceSchema>;

/** What an analyzer emits. Persistence adds ids and fingerprints. */
export const FindingInputSchema = z.object({
  ruleId: z.string().regex(/^[a-z]+\/[a-z0-9-]+$/),
  category: CategorySchema,
  severity: SeveritySchema,
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  filePath: z.string().nullable(),
  line: z.number().int().positive().nullable(),
  endLine: z.number().int().positive().nullable(),
  /** Stable identity within the file, used for fingerprinting (symbol name, package name, ...). */
  symbol: z.string().nullable(),
  evidence: FindingEvidenceSchema,
  recommendation: z.string().min(1).max(2000),
});
export type FindingInput = z.infer<typeof FindingInputSchema>;

export const FindingSchema = FindingInputSchema.extend({
  id: z.string(),
  analysisId: z.string(),
  fingerprint: z.string(),
  githubIssueUrl: z.string().nullable(),
});
export type Finding = z.infer<typeof FindingSchema>;

export const FindingSummarySchema = z.object({
  bySeverity: z.record(SeveritySchema, z.number().int()),
  byCategory: z.record(CategorySchema, z.number().int()),
  total: z.number().int(),
});
export type FindingSummary = z.infer<typeof FindingSummarySchema>;

export const FINDING_SORTS = ["severity", "file", "rule"] as const;
export const FindingSortSchema = z.enum(FINDING_SORTS);
export type FindingSort = z.infer<typeof FindingSortSchema>;
