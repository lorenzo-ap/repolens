import type {
  AnalysisStatus,
  CategoryScores,
  FindingEvidence,
  FindingSummary,
  MetricsDocument,
  Severity,
  StepKey,
  StepStatus,
} from "@repolens/shared";
import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().default(sql`gen_random_uuid()::text`);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable(
  "users",
  {
    id: id(),
    githubId: bigint("github_id", { mode: "number" }).notNull(),
    login: text("login").notNull(),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_github_id_idx").on(t.githubId)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 hex of the random session token. The raw token only lives in the cookie. */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** AES-256-GCM ciphertext of the GitHub access token (base64: iv.tag.data). */
    encryptedGithubToken: text("encrypted_github_token").notNull(),
    scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_expires_idx").on(t.expiresAt),
  ],
);

export const repositories = pgTable(
  "repositories",
  {
    id: id(),
    /** Owner within RepoLens. Null for demo repositories. */
    ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
    githubId: bigint("github_id", { mode: "number" }),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    fullName: text("full_name").notNull(),
    defaultBranch: text("default_branch").notNull().default("main"),
    isPrivate: boolean("is_private").notNull().default(false),
    isDemo: boolean("is_demo").notNull().default(false),
    sizeKb: integer("size_kb"),
    primaryLanguage: text("primary_language"),
    description: text("description"),
    htmlUrl: text("html_url").notNull(),
    cloneUrl: text("clone_url").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("repositories_owner_full_name_idx").on(t.ownerUserId, t.fullName),
    index("repositories_full_name_idx").on(t.fullName),
    index("repositories_is_demo_idx").on(t.isDemo),
  ],
);

export const analyses = pgTable(
  "analyses",
  {
    id: id(),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    requestedByUserId: text("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: text("status").$type<AnalysisStatus>().notNull().default("queued"),
    commitSha: text("commit_sha"),
    commitDate: timestamp("commit_date", { withTimezone: true }),
    branch: text("branch"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    error: text("error"),
    healthScore: real("health_score"),
    grade: text("grade"),
    categoryScores: jsonb("category_scores").$type<CategoryScores>(),
    findingSummary: jsonb("finding_summary").$type<FindingSummary>(),
    metrics: jsonb("metrics").$type<MetricsDocument>(),
    analyzerVersion: text("analyzer_version").notNull(),
    ...timestamps,
  },
  (t) => [
    index("analyses_repository_created_idx").on(t.repositoryId, t.createdAt),
    index("analyses_repository_status_idx").on(t.repositoryId, t.status),
    // Serves the per-user quota check the API runs before queueing an analysis.
    index("analyses_requested_by_created_idx").on(t.requestedByUserId, t.createdAt),
  ],
);

export const analysisSteps = pgTable(
  "analysis_steps",
  {
    id: id(),
    analysisId: text("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    key: text("key").$type<StepKey>().notNull(),
    label: text("label").notNull(),
    position: integer("position").notNull(),
    status: text("status").$type<StepStatus>().notNull().default("pending"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    detail: text("detail"),
    error: text("error"),
  },
  (t) => [uniqueIndex("analysis_steps_analysis_key_idx").on(t.analysisId, t.key)],
);

export const findings = pgTable(
  "findings",
  {
    id: id(),
    analysisId: text("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    ruleId: text("rule_id").notNull(),
    category: text("category").notNull(),
    severity: text("severity").$type<Severity>().notNull(),
    severityRank: integer("severity_rank").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    filePath: text("file_path"),
    line: integer("line"),
    endLine: integer("end_line"),
    symbol: text("symbol"),
    evidence: jsonb("evidence").$type<FindingEvidence>().notNull(),
    recommendation: text("recommendation").notNull(),
    fingerprint: text("fingerprint").notNull(),
    githubIssueUrl: text("github_issue_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("findings_analysis_severity_idx").on(t.analysisId, t.severityRank, t.id),
    index("findings_analysis_file_idx").on(t.analysisId, t.filePath),
    index("findings_analysis_fingerprint_idx").on(t.analysisId, t.fingerprint),
    index("findings_analysis_category_idx").on(t.analysisId, t.category),
  ],
);

export const moduleNodes = pgTable(
  "module_nodes",
  {
    id: id(),
    analysisId: text("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    kind: text("kind").$type<"dir" | "file">().notNull(),
    parentPath: text("parent_path"),
    loc: integer("loc").notNull().default(0),
    fileCount: integer("file_count").notNull().default(0),
    fanIn: integer("fan_in").notNull().default(0),
    fanOut: integer("fan_out").notNull().default(0),
    instability: real("instability"),
    findingCount: integer("finding_count").notNull().default(0),
    inCycle: boolean("in_cycle").notNull().default(false),
  },
  (t) => [
    uniqueIndex("module_nodes_analysis_path_kind_idx").on(t.analysisId, t.path, t.kind),
    index("module_nodes_analysis_parent_idx").on(t.analysisId, t.kind, t.parentPath),
  ],
);

export const moduleEdges = pgTable(
  "module_edges",
  {
    id: id(),
    analysisId: text("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"dir" | "file">().notNull(),
    fromPath: text("from_path").notNull(),
    toPath: text("to_path").notNull(),
    weight: integer("weight").notNull().default(1),
    inCycle: boolean("in_cycle").notNull().default(false),
  },
  (t) => [index("module_edges_analysis_kind_idx").on(t.analysisId, t.kind)],
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  repositories: many(repositories),
}));

export const repositoriesRelations = relations(repositories, ({ one, many }) => ({
  owner: one(users, { fields: [repositories.ownerUserId], references: [users.id] }),
  analyses: many(analyses),
}));

export const analysesRelations = relations(analyses, ({ one, many }) => ({
  repository: one(repositories, { fields: [analyses.repositoryId], references: [repositories.id] }),
  steps: many(analysisSteps),
  findings: many(findings),
}));

export const analysisStepsRelations = relations(analysisSteps, ({ one }) => ({
  analysis: one(analyses, { fields: [analysisSteps.analysisId], references: [analyses.id] }),
}));

export const findingsRelations = relations(findings, ({ one }) => ({
  analysis: one(analyses, { fields: [findings.analysisId], references: [analyses.id] }),
}));

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type RepositoryRow = typeof repositories.$inferSelect;
export type AnalysisRow = typeof analyses.$inferSelect;
export type AnalysisStepRow = typeof analysisSteps.$inferSelect;
export type FindingRow = typeof findings.$inferSelect;
export type NewFindingRow = typeof findings.$inferInsert;
export type ModuleNodeRow = typeof moduleNodes.$inferSelect;
export type NewModuleNodeRow = typeof moduleNodes.$inferInsert;
export type ModuleEdgeRow = typeof moduleEdges.$inferSelect;
export type NewModuleEdgeRow = typeof moduleEdges.$inferInsert;
