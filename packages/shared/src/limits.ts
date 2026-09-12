/** Hard limits shared by the API (pre-flight checks) and the analyzer (enforcement). */
export const LIMITS = {
  /** Maximum repository size as reported by GitHub, in kilobytes. */
  maxRepoSizeKb: 500 * 1024,
  /** Maximum working tree size after clone, in bytes. */
  maxWorkingTreeBytes: 750 * 1024 * 1024,
  /** Maximum number of files enumerated. Enumeration stops and the result is marked truncated. */
  maxFiles: 20_000,
  /** Maximum size of a single file parsed by the AST analyzers, in bytes. */
  maxAstFileBytes: 1024 * 1024,
  /** Maximum size of a single file read for text-based analysis, in bytes. */
  maxTextFileBytes: 2 * 1024 * 1024,
  /** Git clone timeout in milliseconds. */
  cloneTimeoutMs: 120_000,
  /** Overall analysis timeout in milliseconds. */
  analysisTimeoutMs: 10 * 60_000,
  /** Commits read for history analysis (also the clone depth). */
  maxCommits: 400,
  /** Maximum findings persisted per analysis (analyzers cap earlier; this is the safety net). */
  maxFindings: 5_000,
  /** Maximum nodes returned by the architecture endpoint at file level. */
  maxGraphNodes: 400,
} as const;

export const ANALYZER_VERSION = "1.0.0";
