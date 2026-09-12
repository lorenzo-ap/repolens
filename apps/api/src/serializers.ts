import type {
  AnalysisRow,
  AnalysisStepRow,
  FindingRow,
  RepositoryRow,
  UserRow,
} from "@repolens/database";
import type { AnalysisStep, AnalysisSummary, Finding, Repository, User } from "@repolens/shared";

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export function serializeUser(row: UserRow): User {
  return { id: row.id, login: row.login, name: row.name, avatarUrl: row.avatarUrl };
}

export function serializeRepository(row: RepositoryRow, viewerUserId: string | null): Repository {
  return {
    id: row.id,
    owner: row.owner,
    name: row.name,
    fullName: row.fullName,
    defaultBranch: row.defaultBranch,
    isPrivate: row.isPrivate,
    isDemo: row.isDemo,
    sizeKb: row.sizeKb,
    primaryLanguage: row.primaryLanguage,
    description: row.description,
    htmlUrl: row.htmlUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    canManage: !row.isDemo && row.ownerUserId !== null && row.ownerUserId === viewerUserId,
  };
}

export function serializeAnalysis(row: Omit<AnalysisRow, "metrics">): AnalysisSummary {
  return {
    id: row.id,
    repositoryId: row.repositoryId,
    status: row.status,
    commitSha: row.commitSha,
    commitDate: iso(row.commitDate),
    branch: row.branch,
    healthScore: row.healthScore,
    grade: (row.grade as AnalysisSummary["grade"]) ?? null,
    categoryScores: row.categoryScores ?? null,
    findingSummary: row.findingSummary ?? null,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
    durationMs: row.durationMs,
    analyzerVersion: row.analyzerVersion,
  };
}

export function serializeStep(row: AnalysisStepRow): AnalysisStep {
  return {
    key: row.key,
    label: row.label,
    status: row.status,
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
    durationMs: row.durationMs,
    detail: row.detail,
    error: row.error,
  };
}

export function serializeFinding(row: FindingRow): Finding {
  return {
    id: row.id,
    analysisId: row.analysisId,
    ruleId: row.ruleId,
    category: row.category as Finding["category"],
    severity: row.severity,
    title: row.title,
    message: row.message,
    filePath: row.filePath,
    line: row.line,
    endLine: row.endLine,
    symbol: row.symbol,
    evidence: row.evidence,
    recommendation: row.recommendation,
    fingerprint: row.fingerprint,
    githubIssueUrl: row.githubIssueUrl,
  };
}
