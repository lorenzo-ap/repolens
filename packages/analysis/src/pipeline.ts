import type { FindingInput, MetricsDocument, StepKey } from "@repolens/shared";
import { LIMITS, STEP_LABELS } from "@repolens/shared";
import type { Project } from "ts-morph";
import { type ArchitectureGraph, architectureAnalyzer } from "./analyzers/architecture";
import { complexityAnalyzer } from "./analyzers/complexity";
import { dependenciesAnalyzer } from "./analyzers/dependencies";
import { gitHistoryAnalyzer } from "./analyzers/git-history";
import { qualityAnalyzer } from "./analyzers/quality";
import { structureAnalyzer } from "./analyzers/structure";
import { testingAnalyzer } from "./analyzers/testing";
import { typescriptAnalyzer } from "./analyzers/typescript";
import { buildProject } from "./ast/project";
import { capFindings } from "./findings";
import { enumerateFiles } from "./fs/enumerate";
import { computeScoring } from "./scoring/score";
import {
  AnalysisAbortedError,
  type Analyzer,
  type AnalyzerContext,
  type Logger,
  noopLogger,
  throwIfAborted,
} from "./types";

export type PipelineStepKey = Exclude<StepKey, "clone">;

export interface StepEvent {
  key: PipelineStepKey;
  label: string;
  status: "running" | "completed" | "failed" | "skipped";
  durationMs?: number;
  detail?: string;
  error?: string;
}

export interface PipelineOptions {
  rootDir: string;
  signal?: AbortSignal;
  logger?: Logger;
  /** Pass `null` to disable all network access (advisory lookups). */
  fetch?: typeof fetch | null;
  onStep?: (event: StepEvent) => void | Promise<void>;
  maxFiles?: number;
  /** Restrict to a subset of analyzers (tests). Scoring always runs. */
  only?: PipelineStepKey[];
}

export interface PipelineResult {
  metrics: MetricsDocument;
  findings: FindingInput[];
  graph: ArchitectureGraph | null;
  steps: StepEvent[];
  filesEnumerated: number;
  truncated: boolean;
}

/** Order matters: later analyzers may read earlier metrics (hotspots need complexity). */
export const ANALYZERS: Analyzer<unknown>[] = [
  structureAnalyzer,
  typescriptAnalyzer,
  qualityAnalyzer,
  complexityAnalyzer,
  dependenciesAnalyzer,
  architectureAnalyzer,
  testingAnalyzer,
  gitHistoryAnalyzer,
] as Analyzer<unknown>[];

export class CriticalStepError extends Error {
  constructor(
    public readonly step: PipelineStepKey,
    cause: unknown,
  ) {
    super(`${STEP_LABELS[step]} failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "CriticalStepError";
  }
}

export async function runPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const logger = options.logger ?? noopLogger;
  const signal = options.signal ?? new AbortController().signal;
  const steps: StepEvent[] = [];
  const emit = async (e: StepEvent) => {
    steps.push(e);
    await options.onStep?.(e);
  };

  const enumerated = await enumerateFiles(options.rootDir, {
    maxFiles: options.maxFiles ?? LIMITS.maxFiles,
    signal,
  });
  throwIfAborted(signal);

  let project: Project | null = null;
  const metrics: MetricsDocument = {
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
  const ctx: AnalyzerContext = {
    rootDir: options.rootDir,
    files: enumerated.files,
    truncated: enumerated.truncated,
    getProject() {
      if (!project) {
        const built = buildProject(enumerated.files);
        project = built.project;
        logger.info(
          { parsed: built.parsedFiles, skipped: built.skippedLargeFiles },
          "ts project built",
        );
      }
      return project;
    },
    signal,
    logger,
    fetch: options.fetch === undefined ? globalThis.fetch : options.fetch,
    metrics,
  };

  const findings: FindingInput[] = [];
  let graph: ArchitectureGraph | null = null;

  for (const analyzer of ANALYZERS) {
    if (options.only && !options.only.includes(analyzer.key)) {
      await emit({ key: analyzer.key, label: STEP_LABELS[analyzer.key], status: "skipped" });
      continue;
    }
    throwIfAborted(signal);
    await emit({ key: analyzer.key, label: STEP_LABELS[analyzer.key], status: "running" });
    const started = Date.now();
    try {
      const result = await analyzer.run(ctx);
      (metrics as Record<string, unknown>)[analyzer.key] = result.metrics;
      findings.push(...result.findings);
      if (analyzer.key === "architecture" && result.extra)
        graph = result.extra as ArchitectureGraph;
      await emit({
        key: analyzer.key,
        label: STEP_LABELS[analyzer.key],
        status: "completed",
        durationMs: Date.now() - started,
        detail: result.detail,
      });
    } catch (err) {
      if (err instanceof AnalysisAbortedError || signal.aborted)
        throw err instanceof AnalysisAbortedError ? err : new AnalysisAbortedError();
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ step: analyzer.key, err: message }, "analyzer failed");
      await emit({
        key: analyzer.key,
        label: STEP_LABELS[analyzer.key],
        status: "failed",
        durationMs: Date.now() - started,
        error: message,
      });
      if (analyzer.critical) throw new CriticalStepError(analyzer.key, err);
    }
  }

  await emit({ key: "scoring", label: STEP_LABELS.scoring, status: "running" });
  const started = Date.now();
  const capped = capFindings(findings, LIMITS.maxFindings);
  metrics.scoring = computeScoring(metrics, capped);
  await emit({
    key: "scoring",
    label: STEP_LABELS.scoring,
    status: "completed",
    durationMs: Date.now() - started,
    detail: `Health score ${metrics.scoring.healthScore}`,
  });

  return {
    metrics,
    findings: capped,
    graph,
    steps,
    filesEnumerated: enumerated.files.length,
    truncated: enumerated.truncated,
  };
}
