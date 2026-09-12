import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { GitError, type Logger, runGit, scrub } from "@repolens/analysis";
import { LIMITS } from "@repolens/shared";

const execFileAsync = promisify(execFile);

export interface CloneOptions {
  /** HTTPS clone URL without credentials. */
  cloneUrl: string;
  /** GitHub token for private repositories; injected via a credential header, never in the URL. */
  token?: string | null;
  /** Branch name or full commit SHA to analyze. Defaults to the remote HEAD. */
  ref?: string | null;
  workdir: string;
  signal: AbortSignal;
  logger: Logger;
  maxWorkingTreeBytes?: number;
}

export interface CloneResult {
  dir: string;
  commitSha: string;
  commitDate: Date;
  branch: string | null;
  cleanup: () => Promise<void>;
}

export class CloneError extends Error {
  constructor(
    message: string,
    public readonly reason: "timeout" | "not_found" | "auth" | "too_large" | "unknown",
  ) {
    super(message);
    this.name = "CloneError";
  }
}

function assertHttpsGitHubUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new CloneError("Clone URL is not a valid URL", "unknown");
  }
  if (parsed.protocol !== "https:")
    throw new CloneError("Only https clone URLs are allowed", "unknown");
  if (parsed.username || parsed.password)
    throw new CloneError("Clone URL must not embed credentials", "unknown");
  if (parsed.hostname !== "github.com")
    throw new CloneError("Only github.com repositories are supported", "unknown");
  if (!/^\/[\w.-]+\/[\w.-]+(\.git)?$/.test(parsed.pathname))
    throw new CloneError("Clone URL path is not owner/name", "unknown");
}

async function workingTreeBytes(dir: string): Promise<number> {
  const { stdout } = await execFileAsync("du", ["-sk", "--exclude=.git", dir], { timeout: 30_000 });
  const kb = Number.parseInt(stdout.split("\t")[0] ?? "0", 10);
  return Number.isFinite(kb) ? kb * 1024 : 0;
}

/**
 * Fetches a single ref at limited depth into a fresh directory. Uses `git init` + `git fetch` so
 * that both branch names and arbitrary commit SHAs work the same way. Authentication goes through
 * an `Authorization` header configured via the environment, which keeps the token out of argv,
 * the URL, the remote config and any error output.
 */
export async function cloneRepository(options: CloneOptions): Promise<CloneResult> {
  assertHttpsGitHubUrl(options.cloneUrl);
  await mkdir(options.workdir, { recursive: true });
  const dir = join(options.workdir, `repo-${randomBytes(8).toString("hex")}`);
  await mkdir(dir);
  const cleanup = async () => {
    await rm(dir, { recursive: true, force: true, maxRetries: 3 });
  };
  // The token travels as git configuration through the environment (GIT_CONFIG_*), never in
  // argv, so it does not show up in process listings, and never in the URL or the remote config.
  const authEnv: Record<string, string> = options.token
    ? {
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "http.extraHeader",
        GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`x-access-token:${options.token}`).toString("base64")}`,
      }
    : {};
  const git = (args: string[], timeoutMs: number = LIMITS.cloneTimeoutMs) =>
    runGit(args, { cwd: dir, timeoutMs, signal: options.signal, env: authEnv });

  let ref = options.ref?.trim() || "HEAD";
  let branch: string | null = null;
  try {
    await git(["init", "-q"]);
    await git(["remote", "add", "origin", options.cloneUrl]);
    if (ref === "HEAD") {
      // Resolve the default branch so the analysis records a real branch name.
      const { stdout } = await git(["ls-remote", "--symref", "origin", "HEAD"], 30_000);
      const m = /^ref: refs\/heads\/(\S+)\s+HEAD$/m.exec(stdout);
      if (m?.[1]) {
        branch = m[1];
        ref = m[1];
      }
    } else if (!/^[0-9a-f]{40}$/i.test(ref)) {
      branch = ref;
    }
    await git(["fetch", "-q", `--depth=${LIMITS.maxCommits}`, "--no-tags", "origin", ref]);
    await git(["checkout", "-q", "--detach", "FETCH_HEAD"]);
  } catch (err) {
    await cleanup();
    if (err instanceof GitError) {
      const text = `${err.message} ${err.stderr}`.toLowerCase();
      if (text.includes("timed out"))
        throw new CloneError("Cloning timed out. The repository may be too large.", "timeout");
      if (
        text.includes("not found") ||
        text.includes("could not read") ||
        text.includes("does not exist")
      )
        throw new CloneError("Repository or ref not found.", "not_found");
      if (text.includes("authentication") || text.includes("403") || text.includes("401"))
        throw new CloneError("GitHub refused access to this repository.", "auth");
      throw new CloneError(`git failed: ${scrub(err.message)}`, "unknown");
    }
    throw err;
  }

  const bytes = await workingTreeBytes(dir);
  const max = options.maxWorkingTreeBytes ?? LIMITS.maxWorkingTreeBytes;
  if (bytes > max) {
    await cleanup();
    throw new CloneError(
      `Working tree is ${(bytes / 1024 / 1024).toFixed(0)} MB, above the ${(max / 1024 / 1024).toFixed(0)} MB limit.`,
      "too_large",
    );
  }

  const { stdout } = await git(["log", "-1", "--format=%H%n%cI"], 30_000);
  const [commitSha, dateIso] = stdout.trim().split("\n");
  if (!commitSha || !dateIso) {
    await cleanup();
    throw new CloneError("Could not read the checked-out commit.", "unknown");
  }
  options.logger.info({ dir, commitSha, bytes }, "repository fetched");
  return { dir, commitSha, commitDate: new Date(dateIso), branch, cleanup };
}
