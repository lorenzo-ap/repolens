import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const ConfigSchema = z.object({
  DATABASE_URL: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .optional(),
  ANALYZER_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),
  ANALYZER_WORKDIR: z.string().optional(),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Set to "false" to disable advisory lookups (offline environments). */
  ANALYZER_NETWORK: z.enum(["true", "false"]).default("true"),
});

export type AnalyzerConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid analyzer configuration: ${issues}`);
  }
  const c = parsed.data;
  return {
    databaseUrl: c.DATABASE_URL,
    tokenEncryptionKey: c.TOKEN_ENCRYPTION_KEY ?? null,
    concurrency: c.ANALYZER_CONCURRENCY,
    workdir: c.ANALYZER_WORKDIR || join(tmpdir(), "repolens-work"),
    logLevel: c.LOG_LEVEL,
    nodeEnv: c.NODE_ENV,
    network: c.ANALYZER_NETWORK === "true",
  };
}
