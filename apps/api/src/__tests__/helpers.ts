import {
  analyses,
  analysisSteps,
  createDatabase,
  findings,
  generateSessionToken,
  moduleEdges,
  moduleNodes,
  repositories,
  sessions,
  TokenCipher,
  users,
} from "@repolens/database";
import {
  ANALYZER_VERSION,
  type AnalysisJobPayload,
  type MetricsDocument,
  SEVERITY_RANK,
  STEP_KEYS,
  STEP_LABELS,
} from "@repolens/shared";
import type { FastifyInstance } from "fastify";
import pino from "pino";
import { buildApp } from "../app";
import { loadConfig } from "../config";
import type { AppContext } from "../context";
import type { GitHubClient, GitHubRepository } from "../lib/github";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://repolens:repolens@localhost:5432/repolens_test";
const KEY = "0".repeat(64);

export interface TestHarness {
  app: FastifyInstance;
  ctx: AppContext;
  enqueued: AnalysisJobPayload[];
  github: FakeGitHub;
  close: () => Promise<void>;
  reset: () => Promise<void>;
}

export class FakeGitHub implements GitHubClient {
  repos: GitHubRepository[] = [];
  issues: Array<{ owner: string; name: string; title: string; body: string }> = [];
  /** redirect_uri values seen by the token exchange; GitHub rejects a mismatch with /authorize. */
  redirectUris: string[] = [];
  user = { id: 1001, login: "alice", name: "Alice", avatar_url: null };
  failNext: Error | null = null;

  async exchangeCode(_code: string, redirectUri: string) {
    this.redirectUris.push(redirectUri);
    return { accessToken: "gho_test_token", scopes: ["read:user", "repo"] };
  }
  async getUser() {
    return this.user;
  }
  async listRepos(_token: string, { page, perPage }: { page: number; perPage: number }) {
    const start = (page - 1) * perPage;
    return {
      repos: this.repos.slice(start, start + perPage),
      hasMore: start + perPage < this.repos.length,
    };
  }
  async getRepo(_token: string, owner: string, name: string) {
    if (this.failNext) {
      const e = this.failNext;
      this.failNext = null;
      throw e;
    }
    const r = this.repos.find((x) => x.owner.login === owner && x.name === name);
    if (!r) {
      const { GitHubApiError } = await import("../lib/errors");
      throw new GitHubApiError("GitHub: Not Found", 404);
    }
    return r;
  }
  async createIssue(
    _token: string,
    owner: string,
    name: string,
    issue: { title: string; body: string },
  ) {
    this.issues.push({ owner, name, ...issue });
    return {
      number: this.issues.length,
      html_url: `https://github.com/${owner}/${name}/issues/${this.issues.length}`,
    };
  }
}

export function ghRepo(
  overrides: Partial<GitHubRepository> & { owner: { login: string }; name: string },
): GitHubRepository {
  return {
    id: Math.floor(Math.random() * 1e9),
    full_name: `${overrides.owner.login}/${overrides.name}`,
    description: null,
    private: false,
    default_branch: "main",
    language: "TypeScript",
    size: 1024,
    pushed_at: "2025-01-01T00:00:00Z",
    html_url: `https://github.com/${overrides.owner.login}/${overrides.name}`,
    clone_url: `https://github.com/${overrides.owner.login}/${overrides.name}.git`,
    ...overrides,
  };
}

/** `env` overrides the API configuration, for suites that need a different limit or quota. */
export async function createHarness(env: NodeJS.ProcessEnv = {}): Promise<TestHarness> {
  const database = createDatabase(TEST_DATABASE_URL, { max: 3 });
  const config = loadConfig({
    DATABASE_URL: TEST_DATABASE_URL,
    TOKEN_ENCRYPTION_KEY: KEY,
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    GITHUB_CLIENT_ID: "id",
    GITHUB_CLIENT_SECRET: "secret",
    WEB_ORIGIN: "http://localhost:3000",
    API_ORIGIN: "http://localhost:4000",
    ...env,
  });
  const enqueued: AnalysisJobPayload[] = [];
  const github = new FakeGitHub();
  const ctx: AppContext = {
    db: database.db,
    dbPing: database.ping,
    queue: {
      async enqueue(p) {
        enqueued.push(p);
      },
      async ping() {
        return true;
      },
    },
    github,
    cipher: new TokenCipher(KEY),
    config,
    logger: pino({ level: "silent" }),
    version: "test",
  };
  const app = await buildApp(ctx);
  await app.ready();
  const reset = async () => {
    await database.sql`truncate table users, sessions, repositories, analyses, analysis_steps, findings, module_nodes, module_edges restart identity cascade`;
    enqueued.length = 0;
    github.repos = [];
    github.issues = [];
    github.redirectUris = [];
  };
  return {
    app,
    ctx,
    enqueued,
    github,
    reset,
    close: async () => {
      await app.close();
      await database.close();
    },
  };
}

export async function seedUser(h: TestHarness, login = "alice", githubId = 1001) {
  const [user] = await h.ctx.db.insert(users).values({ githubId, login, name: login }).returning();
  if (!user) throw new Error("seed user failed");
  const { token, hash } = generateSessionToken();
  await h.ctx.db.insert(sessions).values({
    id: hash,
    userId: user.id,
    encryptedGithubToken: h.ctx.cipher.encrypt("gho_seeded"),
    scopes: ["read:user", "repo"],
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  return { user, cookie: `${h.ctx.config.sessionCookieName}=${token}` };
}

export const emptyMetrics: MetricsDocument = {
  structure: null,
  typescript: null,
  quality: null,
  complexity: null,
  dependencies: null,
  architecture: null,
  testing: null,
  gitHistory: null,
  scoring: null,
};

export async function seedRepository(
  h: TestHarness,
  opts: {
    ownerUserId: string | null;
    owner?: string;
    name?: string;
    isDemo?: boolean;
    isPrivate?: boolean;
  },
) {
  const owner = opts.owner ?? "acme";
  const name = opts.name ?? "widgets";
  const [repo] = await h.ctx.db
    .insert(repositories)
    .values({
      ownerUserId: opts.ownerUserId,
      githubId: opts.isDemo ? null : 42,
      owner,
      name,
      fullName: `${owner}/${name}`,
      defaultBranch: "main",
      isPrivate: opts.isPrivate ?? false,
      isDemo: opts.isDemo ?? false,
      sizeKb: 100,
      primaryLanguage: "TypeScript",
      htmlUrl: `https://github.com/${owner}/${name}`,
      cloneUrl: `https://github.com/${owner}/${name}.git`,
    })
    .returning();
  if (!repo) throw new Error("seed repo failed");
  return repo;
}

export interface SeedFinding {
  ruleId: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category:
    | "quality"
    | "complexity"
    | "architecture"
    | "dependencies"
    | "testing"
    | "maintainability"
    | "gitHealth";
  filePath: string | null;
  symbol?: string | null;
  title?: string;
}

export async function seedCompletedAnalysis(
  h: TestHarness,
  repositoryId: string,
  opts: {
    healthScore?: number;
    findings?: SeedFinding[];
    createdAt?: Date;
    commitSha?: string;
    metrics?: MetricsDocument;
  } = {},
) {
  const createdAt = opts.createdAt ?? new Date();
  const list = opts.findings ?? [];
  const [analysis] = await h.ctx.db
    .insert(analyses)
    .values({
      repositoryId,
      status: "completed",
      commitSha: opts.commitSha ?? "a".repeat(40),
      commitDate: createdAt,
      branch: "main",
      startedAt: createdAt,
      finishedAt: createdAt,
      durationMs: 1234,
      healthScore: opts.healthScore ?? 72.5,
      grade: "C",
      categoryScores: {
        quality: 70,
        complexity: 80,
        architecture: 60,
        dependencies: 75,
        testing: 65,
        maintainability: 80,
        gitHealth: 90,
      },
      findingSummary: {
        total: list.length,
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        byCategory: {
          quality: 0,
          complexity: 0,
          architecture: 0,
          dependencies: 0,
          testing: 0,
          maintainability: 0,
          gitHealth: 0,
        },
      },
      metrics: opts.metrics ?? emptyMetrics,
      analyzerVersion: ANALYZER_VERSION,
      createdAt,
      updatedAt: createdAt,
    })
    .returning();
  if (!analysis) throw new Error("seed analysis failed");
  await h.ctx.db.insert(analysisSteps).values(
    STEP_KEYS.map((key, position) => ({
      analysisId: analysis.id,
      key,
      label: STEP_LABELS[key],
      position,
      status: "completed" as const,
    })),
  );
  if (list.length) {
    await h.ctx.db.insert(findings).values(
      list.map((f) => ({
        analysisId: analysis.id,
        ruleId: f.ruleId,
        category: f.category,
        severity: f.severity,
        severityRank: SEVERITY_RANK[f.severity],
        title: f.title ?? `${f.ruleId} in ${f.filePath ?? "repo"}`,
        message: "message",
        filePath: f.filePath,
        line: f.filePath ? 10 : null,
        endLine: null,
        symbol: f.symbol ?? null,
        evidence: { snippet: "const x = 1;" },
        recommendation: "fix it",
        fingerprint: `${f.ruleId}|${f.filePath ?? ""}|${f.symbol ?? ""}`,
      })),
    );
  }
  await h.ctx.db.insert(moduleNodes).values([
    {
      analysisId: analysis.id,
      path: "src",
      kind: "dir",
      parentPath: null,
      loc: 100,
      fileCount: 2,
      fanIn: 0,
      fanOut: 1,
      instability: 1,
      findingCount: 1,
      inCycle: false,
    },
    {
      analysisId: analysis.id,
      path: "src/lib",
      kind: "dir",
      parentPath: "src",
      loc: 50,
      fileCount: 1,
      fanIn: 1,
      fanOut: 0,
      instability: 0,
      findingCount: 0,
      inCycle: false,
    },
    {
      analysisId: analysis.id,
      path: "src/a.ts",
      kind: "file",
      parentPath: "src",
      loc: 60,
      fileCount: 1,
      fanIn: 0,
      fanOut: 1,
      instability: 1,
      findingCount: 1,
      inCycle: false,
    },
    {
      analysisId: analysis.id,
      path: "src/b.ts",
      kind: "file",
      parentPath: "src",
      loc: 40,
      fileCount: 1,
      fanIn: 1,
      fanOut: 0,
      instability: 0,
      findingCount: 0,
      inCycle: false,
    },
    {
      analysisId: analysis.id,
      path: "src/lib/c.ts",
      kind: "file",
      parentPath: "src/lib",
      loc: 50,
      fileCount: 1,
      fanIn: 1,
      fanOut: 0,
      instability: 0,
      findingCount: 0,
      inCycle: false,
    },
  ]);
  await h.ctx.db.insert(moduleEdges).values([
    {
      analysisId: analysis.id,
      kind: "dir",
      fromPath: "src",
      toPath: "src/lib",
      weight: 1,
      inCycle: false,
    },
    {
      analysisId: analysis.id,
      kind: "file",
      fromPath: "src/a.ts",
      toPath: "src/b.ts",
      weight: 1,
      inCycle: false,
    },
    {
      analysisId: analysis.id,
      kind: "file",
      fromPath: "src/a.ts",
      toPath: "src/lib/c.ts",
      weight: 1,
      inCycle: false,
    },
  ]);
  return analysis;
}

export const ORIGIN = { origin: "http://localhost:3000" };
