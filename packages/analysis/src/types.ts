import type { FindingInput, MetricsDocument, StepKey } from "@repolens/shared";
import type { Project } from "ts-morph";

export interface Logger {
  debug(obj: Record<string, unknown> | string, msg?: string): void;
  info(obj: Record<string, unknown> | string, msg?: string): void;
  warn(obj: Record<string, unknown> | string, msg?: string): void;
  error(obj: Record<string, unknown> | string, msg?: string): void;
}

export const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

export interface RepoFile {
  /** Path relative to the repository root, always using forward slashes. */
  path: string;
  /** Absolute path on disk. */
  absolutePath: string;
  /** Size in bytes. */
  size: number;
  /** Lower-cased extension without the dot, or "" for none. */
  ext: string;
  /** Detected language label, or null for binary/unknown. */
  language: string | null;
  /** Line count for text files; 0 for binary or unread files. */
  lines: number;
  /** True for files that look like test files by path convention. */
  isTest: boolean;
  /** True when the file is TypeScript or JavaScript and eligible for AST parsing. */
  isSource: boolean;
}

export interface AnalyzerContext {
  rootDir: string;
  files: RepoFile[];
  truncated: boolean;
  /** Lazily created ts-morph project shared by AST analyzers. */
  getProject(): Project;
  signal: AbortSignal;
  logger: Logger;
  /** Optional network access for advisory lookups. Null disables network entirely. */
  fetch: typeof globalThis.fetch | null;
  /** Results of previously run analyzers, available to later ones (e.g. hotspots need complexity). */
  metrics: Partial<MetricsDocument>;
}

export interface AnalyzerResult<M> {
  metrics: M;
  findings: FindingInput[];
  /** One-line human summary shown in the progress view (e.g. "1,284 files, 96,410 lines"). */
  detail: string;
  /** Analyzer-specific artifact handed to the pipeline (the architecture graph). */
  extra?: unknown;
}

export interface Analyzer<M> {
  key: Exclude<StepKey, "clone" | "scoring">;
  /** Critical analyzers abort the analysis on failure; others are recorded as failed and skipped. */
  critical: boolean;
  run(ctx: AnalyzerContext): Promise<AnalyzerResult<M>>;
}

export class AnalysisAbortedError extends Error {
  constructor(message = "Analysis aborted") {
    super(message);
    this.name = "AnalysisAbortedError";
  }
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new AnalysisAbortedError(
      signal.reason instanceof Error ? signal.reason.message : "Analysis timed out",
    );
  }
}
