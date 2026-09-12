import type { Database, TokenCipher, UserRow } from "@repolens/database";
import type { AnalysisJobPayload } from "@repolens/shared";
import type { FastifyBaseLogger } from "fastify";
import type { ApiConfig } from "./config";
import type { GitHubClient } from "./lib/github";

export interface Queue {
  enqueue(payload: AnalysisJobPayload): Promise<void>;
  ping(): Promise<boolean>;
}

export interface AppContext {
  db: Database;
  dbPing: () => Promise<boolean>;
  queue: Queue;
  github: GitHubClient | null;
  cipher: TokenCipher;
  config: ApiConfig;
  logger: FastifyBaseLogger;
  version: string;
}

/** The authenticated principal attached to a request, or null for anonymous visitors. */
export interface Viewer {
  user: UserRow;
  sessionId: string;
  scopes: string[];
  /** Lazily decrypts the GitHub token; only called by code paths that talk to GitHub. */
  githubToken(): string;
}

declare module "fastify" {
  interface FastifyInstance {
    ctx: AppContext;
  }
  interface FastifyRequest {
    viewer: Viewer | null;
  }
}
