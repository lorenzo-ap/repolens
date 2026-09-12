import { z } from "zod";
import {
  AnalysisStatusSchema,
  CategorySchema,
  GradeSchema,
  SeveritySchema,
  StepKeySchema,
  StepStatusSchema,
} from "./enums";
import { FindingSchema, FindingSortSchema, FindingSummarySchema } from "./finding";
import { CategoryScoresSchema, HotspotSchema, MetricsDocumentSchema } from "./metrics";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "validation_failed",
  "rate_limited",
  "github_error",
  "conflict",
  "limit_exceeded",
  "internal",
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

// ---------------------------------------------------------------------------
// User & session
// ---------------------------------------------------------------------------

export const UserSchema = z.object({
  id: z.string(),
  login: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});
export type User = z.infer<typeof UserSchema>;

export const MeResponseSchema = z.object({
  user: UserSchema.nullable(),
  scopes: z.array(z.string()),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export const AnalysisSummarySchema = z.object({
  id: z.string(),
  repositoryId: z.string(),
  status: AnalysisStatusSchema,
  commitSha: z.string().nullable(),
  commitDate: z.string().nullable(),
  branch: z.string().nullable(),
  healthScore: z.number().nullable(),
  grade: GradeSchema.nullable(),
  categoryScores: CategoryScoresSchema.nullable(),
  findingSummary: FindingSummarySchema.nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  analyzerVersion: z.string(),
});
export type AnalysisSummary = z.infer<typeof AnalysisSummarySchema>;

export const RepositorySchema = z.object({
  id: z.string(),
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
  defaultBranch: z.string(),
  isPrivate: z.boolean(),
  isDemo: z.boolean(),
  sizeKb: z.number().int().nullable(),
  primaryLanguage: z.string().nullable(),
  description: z.string().nullable(),
  htmlUrl: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Whether the current viewer may mutate this repository (analyze, delete, create issues). */
  canManage: z.boolean(),
});
export type Repository = z.infer<typeof RepositorySchema>;

export const RepositoryDetailSchema = z.object({
  repository: RepositorySchema,
  latestAnalysis: AnalysisSummarySchema.nullable(),
  activeAnalysis: AnalysisSummarySchema.nullable(),
  analysisCount: z.number().int(),
});
export type RepositoryDetail = z.infer<typeof RepositoryDetailSchema>;

export const CreateRepositoryBodySchema = z.object({
  owner: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
});
export type CreateRepositoryBody = z.infer<typeof CreateRepositoryBodySchema>;

export const GitHubRepoSchema = z.object({
  githubId: z.number().int(),
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
  description: z.string().nullable(),
  isPrivate: z.boolean(),
  defaultBranch: z.string(),
  primaryLanguage: z.string().nullable(),
  sizeKb: z.number().int(),
  pushedAt: z.string().nullable(),
  htmlUrl: z.string(),
  /** Local state, when the repository has been added to RepoLens. */
  local: z
    .object({
      repositoryId: z.string(),
      latestAnalysis: AnalysisSummarySchema.nullable(),
      activeAnalysis: AnalysisSummarySchema.nullable(),
    })
    .nullable(),
});
export type GitHubRepo = z.infer<typeof GitHubRepoSchema>;

export const GitHubReposResponseSchema = z.object({
  repos: z.array(GitHubRepoSchema),
  page: z.number().int(),
  hasMore: z.boolean(),
});
export type GitHubReposResponse = z.infer<typeof GitHubReposResponseSchema>;

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export const AnalysisStepSchema = z.object({
  key: StepKeySchema,
  label: z.string(),
  status: StepStatusSchema,
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  detail: z.string().nullable(),
  error: z.string().nullable(),
});
export type AnalysisStep = z.infer<typeof AnalysisStepSchema>;

export const AnalysisDetailSchema = z.object({
  analysis: AnalysisSummarySchema,
  repository: RepositorySchema,
  steps: z.array(AnalysisStepSchema),
  previousAnalysisId: z.string().nullable(),
});
export type AnalysisDetail = z.infer<typeof AnalysisDetailSchema>;

export const AnalysisListResponseSchema = z.object({
  analyses: z.array(AnalysisSummarySchema),
});
export type AnalysisListResponse = z.infer<typeof AnalysisListResponseSchema>;

export const MetricsResponseSchema = z.object({
  analysisId: z.string(),
  metrics: MetricsDocumentSchema,
});
export type MetricsResponse = z.infer<typeof MetricsResponseSchema>;

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

export const FindingsQuerySchema = z.object({
  severity: z
    .union([SeveritySchema, z.array(SeveritySchema)])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  category: z
    .union([CategorySchema, z.array(CategorySchema)])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  path: z.string().max(500).optional(),
  q: z.string().max(200).optional(),
  ruleId: z.string().max(100).optional(),
  sort: FindingSortSchema.default("severity"),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type FindingsQuery = z.infer<typeof FindingsQuerySchema>;

export const FindingsPageSchema = z.object({
  findings: z.array(FindingSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int(),
  /** Distinct rule ids present for the current analysis (for filter UI). */
  rules: z.array(z.object({ ruleId: z.string(), count: z.number().int() })),
});
export type FindingsPage = z.infer<typeof FindingsPageSchema>;

export const FindingDetailSchema = z.object({
  finding: FindingSchema,
  related: z.array(FindingSchema),
  githubFileUrl: z.string().nullable(),
});
export type FindingDetail = z.infer<typeof FindingDetailSchema>;

export const CreateIssueResponseSchema = z.object({
  url: z.string(),
  number: z.number().int(),
});
export type CreateIssueResponse = z.infer<typeof CreateIssueResponseSchema>;

// ---------------------------------------------------------------------------
// Architecture
// ---------------------------------------------------------------------------

export const ModuleNodeSchema = z.object({
  path: z.string(),
  kind: z.enum(["dir", "file"]),
  loc: z.number().int(),
  fileCount: z.number().int(),
  fanIn: z.number().int(),
  fanOut: z.number().int(),
  instability: z.number().nullable(),
  findingCount: z.number().int(),
  inCycle: z.boolean(),
});
export type ModuleNode = z.infer<typeof ModuleNodeSchema>;

export const ModuleEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  weight: z.number().int(),
  inCycle: z.boolean(),
});
export type ModuleEdge = z.infer<typeof ModuleEdgeSchema>;

export const ArchitectureQuerySchema = z.object({
  level: z.enum(["dir", "file"]).default("dir"),
  root: z.string().max(500).optional(),
});
export type ArchitectureQuery = z.infer<typeof ArchitectureQuerySchema>;

export const ArchitectureResponseSchema = z.object({
  level: z.enum(["dir", "file"]),
  root: z.string().nullable(),
  nodes: z.array(ModuleNodeSchema),
  edges: z.array(ModuleEdgeSchema),
  cycles: z.array(z.object({ paths: z.array(z.string()), length: z.number().int() })),
  truncated: z.boolean(),
});
export type ArchitectureResponse = z.infer<typeof ArchitectureResponseSchema>;

// ---------------------------------------------------------------------------
// History / comparison
// ---------------------------------------------------------------------------

export const HistoryResponseSchema = z.object({
  analysisId: z.string(),
  hotspots: z.array(HotspotSchema),
  authors: z.array(z.object({ name: z.string(), commits: z.number().int(), share: z.number() })),
  commitsPerWeek: z.array(z.object({ week: z.string(), commits: z.number().int() })),
  busFactor: z.number().int(),
  commits: z.number().int(),
});
export type HistoryResponse = z.infer<typeof HistoryResponseSchema>;

export const MetricDeltaSchema = z.object({
  key: z.string(),
  label: z.string(),
  before: z.number().nullable(),
  after: z.number().nullable(),
  /** Whether an increase is good (true), bad (false) or neutral (null). */
  higherIsBetter: z.boolean().nullable(),
});
export type MetricDelta = z.infer<typeof MetricDeltaSchema>;

export const CompareResponseSchema = z.object({
  base: AnalysisSummarySchema,
  target: AnalysisSummarySchema,
  scoreDeltas: z.array(
    z.object({
      category: z.union([CategorySchema, z.literal("health")]),
      before: z.number().nullable(),
      after: z.number().nullable(),
    }),
  ),
  findings: z.object({
    new: z.array(FindingSchema),
    resolved: z.array(FindingSchema),
    unchangedCount: z.number().int(),
  }),
  metricDeltas: z.array(MetricDeltaSchema),
});
export type CompareResponse = z.infer<typeof CompareResponseSchema>;

// ---------------------------------------------------------------------------
// Demo & health
// ---------------------------------------------------------------------------

export const DemoResponseSchema = z.object({
  repository: RepositorySchema,
  latestAnalysis: AnalysisSummarySchema.nullable(),
  topFindings: z.array(FindingSchema),
});
export type DemoResponse = z.infer<typeof DemoResponseSchema>;

export const HealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  database: z.boolean(),
  queue: z.boolean(),
  version: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
