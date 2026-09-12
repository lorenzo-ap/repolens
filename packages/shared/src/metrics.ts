import { z } from "zod";
import { CategorySchema } from "./enums";

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

export const LanguageStatSchema = z.object({
  language: z.string(),
  files: z.number().int(),
  lines: z.number().int(),
});

export const StructureMetricsSchema = z.object({
  totalFiles: z.number().int(),
  totalLines: z.number().int(),
  byLanguage: z.array(LanguageStatSchema),
  largestFiles: z.array(z.object({ path: z.string(), lines: z.number().int() })),
  topLevelDirs: z.array(z.object({ path: z.string(), files: z.number().int() })),
  hasReadme: z.boolean(),
  hasLicense: z.boolean(),
  hasCi: z.boolean(),
  ciProviders: z.array(z.string()),
  hasEditorConfig: z.boolean(),
  hasDockerfile: z.boolean(),
  monorepo: z.boolean(),
  packageManager: z.enum(["pnpm", "npm", "yarn", "bun", "unknown"]),
  truncated: z.boolean(),
});
export type StructureMetrics = z.infer<typeof StructureMetricsSchema>;

// ---------------------------------------------------------------------------
// TypeScript
// ---------------------------------------------------------------------------

export const TypeScriptMetricsSchema = z.object({
  tsFiles: z.number().int(),
  jsFiles: z.number().int(),
  parsedFiles: z.number().int(),
  skippedLargeFiles: z.number().int(),
  hasTsConfig: z.boolean(),
  strictMode: z.boolean().nullable(),
  strictNullChecks: z.boolean().nullable(),
  noImplicitAny: z.boolean().nullable(),
  anyCount: z.number().int(),
  tsIgnoreCount: z.number().int(),
  tsExpectErrorCount: z.number().int(),
  nonNullAssertionCount: z.number().int(),
  typeAssertionCount: z.number().int(),
  enumCount: z.number().int(),
  exportedSymbols: z.number().int(),
  unusedExports: z.number().int(),
});
export type TypeScriptMetrics = z.infer<typeof TypeScriptMetricsSchema>;

// ---------------------------------------------------------------------------
// Quality
// ---------------------------------------------------------------------------

export const QualityMetricsSchema = z.object({
  todoCount: z.number().int(),
  fixmeCount: z.number().int(),
  consoleLogCount: z.number().int(),
  longFunctions: z.number().int(),
  longParameterLists: z.number().int(),
  deepNesting: z.number().int(),
  emptyCatchBlocks: z.number().int(),
  duplicateBlocks: z.number().int(),
  duplicatedLines: z.number().int(),
  duplicationRatio: z.number(),
  commentedOutCodeBlocks: z.number().int(),
  lintConfig: z.enum(["eslint", "biome", "both", "none"]),
  formatterConfig: z.enum(["prettier", "biome", "both", "none"]),
});
export type QualityMetrics = z.infer<typeof QualityMetricsSchema>;

// ---------------------------------------------------------------------------
// Complexity
// ---------------------------------------------------------------------------

export const FunctionComplexitySchema = z.object({
  file: z.string(),
  name: z.string(),
  line: z.number().int(),
  cyclomatic: z.number().int(),
  cognitive: z.number().int(),
  loc: z.number().int(),
});
export type FunctionComplexity = z.infer<typeof FunctionComplexitySchema>;

export const ComplexityMetricsSchema = z.object({
  functions: z.number().int(),
  avgCyclomatic: z.number(),
  p90Cyclomatic: z.number(),
  maxCyclomatic: z.number().int(),
  avgCognitive: z.number(),
  p90Cognitive: z.number(),
  maxCognitive: z.number().int(),
  topFunctions: z.array(FunctionComplexitySchema),
  fileComplexity: z.array(
    z.object({ file: z.string(), sumCyclomatic: z.number().int(), functions: z.number().int() }),
  ),
  distribution: z.object({
    "1-5": z.number().int(),
    "6-10": z.number().int(),
    "11-20": z.number().int(),
    "21-50": z.number().int(),
    "51+": z.number().int(),
  }),
});
export type ComplexityMetrics = z.infer<typeof ComplexityMetricsSchema>;

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export const VulnerabilitySummarySchema = z.object({
  checkedAt: z.string(),
  critical: z.number().int(),
  high: z.number().int(),
  moderate: z.number().int(),
  low: z.number().int(),
  advisories: z.array(
    z.object({
      package: z.string(),
      version: z.string(),
      severity: z.string(),
      title: z.string(),
      url: z.string(),
      vulnerableRange: z.string(),
    }),
  ),
});

export const DependenciesMetricsSchema = z.object({
  manifests: z.number().int(),
  direct: z.number().int(),
  directDev: z.number().int(),
  lockfilePresent: z.boolean(),
  lockfileType: z.enum(["pnpm", "npm", "yarn", "bun", "none"]),
  resolvedPackages: z.number().int(),
  duplicateVersions: z.array(z.object({ name: z.string(), versions: z.array(z.string()) })),
  unpinnedRanges: z.array(z.object({ name: z.string(), range: z.string(), manifest: z.string() })),
  gitOrUrlDeps: z.array(z.object({ name: z.string(), spec: z.string(), manifest: z.string() })),
  deprecatedPackages: z.array(
    z.object({ name: z.string(), reason: z.string(), manifest: z.string() }),
  ),
  workspacePackages: z.number().int(),
  engines: z.record(z.string(), z.string()).nullable(),
  topDependencies: z.array(z.object({ name: z.string(), range: z.string(), dev: z.boolean() })),
  vulnerabilities: VulnerabilitySummarySchema.nullable(),
});
export type DependenciesMetrics = z.infer<typeof DependenciesMetricsSchema>;

// ---------------------------------------------------------------------------
// Architecture
// ---------------------------------------------------------------------------

export const ArchitectureMetricsSchema = z.object({
  fileNodes: z.number().int(),
  fileEdges: z.number().int(),
  dirNodes: z.number().int(),
  dirEdges: z.number().int(),
  externalEdges: z.number().int(),
  unresolvedImports: z.number().int(),
  cycles: z.array(z.object({ paths: z.array(z.string()), length: z.number().int() })),
  cycleCount: z.number().int(),
  cycleFileCount: z.number().int(),
  hubs: z.array(z.object({ path: z.string(), fanIn: z.number().int() })),
  godFiles: z.array(z.object({ path: z.string(), fanOut: z.number().int() })),
  orphanFiles: z.number().int(),
  avgFanOut: z.number(),
  maxDepth: z.number().int(),
});
export type ArchitectureMetrics = z.infer<typeof ArchitectureMetricsSchema>;

// ---------------------------------------------------------------------------
// Testing
// ---------------------------------------------------------------------------

export const TestingMetricsSchema = z.object({
  frameworks: z.array(z.string()),
  testFiles: z.number().int(),
  testLines: z.number().int(),
  sourceFiles: z.number().int(),
  sourceLines: z.number().int(),
  testToSourceRatio: z.number(),
  testCases: z.number().int(),
  skippedTests: z.number().int(),
  onlyTests: z.number().int(),
  sourceDirsWithoutTests: z.array(z.object({ path: z.string(), sourceFiles: z.number().int() })),
  sourceDirsWithTests: z.number().int(),
  hasCoverageConfig: z.boolean(),
  e2ePresent: z.boolean(),
});
export type TestingMetrics = z.infer<typeof TestingMetricsSchema>;

// ---------------------------------------------------------------------------
// Git history
// ---------------------------------------------------------------------------

export const HotspotSchema = z.object({
  file: z.string(),
  commits: z.number().int(),
  churn: z.number().int(),
  complexity: z.number().int(),
  score: z.number(),
});
export type Hotspot = z.infer<typeof HotspotSchema>;

export const GitHistoryMetricsSchema = z.object({
  available: z.boolean(),
  commits: z.number().int(),
  truncated: z.boolean(),
  firstCommit: z.string().nullable(),
  lastCommit: z.string().nullable(),
  activeDays: z.number().int(),
  authors: z.array(z.object({ name: z.string(), commits: z.number().int(), share: z.number() })),
  authorCount: z.number().int(),
  busFactor: z.number().int(),
  commitsPerWeek: z.array(z.object({ week: z.string(), commits: z.number().int() })),
  churn: z.array(
    z.object({
      file: z.string(),
      commits: z.number().int(),
      added: z.number().int(),
      deleted: z.number().int(),
    }),
  ),
  hotspots: z.array(HotspotSchema),
  mergeCommitShare: z.number(),
  avgCommitSize: z.number(),
  largeCommits: z.number().int(),
  daysSinceLastCommit: z.number().int().nullable(),
});
export type GitHistoryMetrics = z.infer<typeof GitHistoryMetricsSchema>;

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export const ScoreInputSchema = z.object({
  label: z.string(),
  value: z.union([z.number(), z.string(), z.boolean(), z.null()]),
  points: z.number(),
  max: z.number(),
  note: z.string().optional(),
});
export type ScoreInput = z.infer<typeof ScoreInputSchema>;

export const CategoryScoreDetailSchema = z.object({
  category: CategorySchema,
  score: z.number(),
  weight: z.number(),
  base: z.number(),
  findingPenalty: z.number(),
  inputs: z.array(ScoreInputSchema),
});
export type CategoryScoreDetail = z.infer<typeof CategoryScoreDetailSchema>;

export const ScoringSchema = z.object({
  version: z.string(),
  healthScore: z.number(),
  categories: z.array(CategoryScoreDetailSchema),
});
export type Scoring = z.infer<typeof ScoringSchema>;

export const CategoryScoresSchema = z.record(CategorySchema, z.number());
export type CategoryScores = z.infer<typeof CategoryScoresSchema>;

// ---------------------------------------------------------------------------
// Full document
// ---------------------------------------------------------------------------

export const MetricsDocumentSchema = z.object({
  structure: StructureMetricsSchema.nullable(),
  typescript: TypeScriptMetricsSchema.nullable(),
  quality: QualityMetricsSchema.nullable(),
  complexity: ComplexityMetricsSchema.nullable(),
  dependencies: DependenciesMetricsSchema.nullable(),
  architecture: ArchitectureMetricsSchema.nullable(),
  testing: TestingMetricsSchema.nullable(),
  gitHistory: GitHistoryMetricsSchema.nullable(),
  scoring: ScoringSchema.nullable(),
});
export type MetricsDocument = z.infer<typeof MetricsDocumentSchema>;
