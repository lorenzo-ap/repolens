import { execFile } from "node:child_process";

export interface GitRunOptions {
  cwd: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  maxBuffer?: number;
  /** Extra environment; credentials are never passed through the environment. */
  env?: Record<string, string>;
}

export class GitError extends Error {
  constructor(
    message: string,
    public readonly args: string[],
    public readonly stderr: string,
    public readonly code: number | null,
  ) {
    super(message);
    this.name = "GitError";
  }
}

/** Environment that prevents git from prompting, reading user config, or running hooks. */
export function safeGitEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: process.env.HOME ?? "/tmp",
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "/bin/true",
    SSH_ASKPASS: "/bin/true",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_SSH_COMMAND: "/bin/false",
    ...extra,
  };
}

/** Hardening flags added to every git invocation. */
export const SAFE_GIT_FLAGS = [
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "core.symlinks=false",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "protocol.allow=never",
  "-c",
  "protocol.https.allow=always",
  "-c",
  "protocol.file.allow=never",
  "-c",
  "credential.helper=",
  "-c",
  "core.autocrlf=false",
  "-c",
  "core.quotepath=false",
];

/**
 * Runs `git` without a shell, with hooks and prompts disabled. Output is captured with a bounded
 * buffer; the process is killed on timeout or abort.
 */
export function runGit(
  args: string[],
  options: GitRunOptions,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "git",
      [...SAFE_GIT_FLAGS, ...args],
      {
        cwd: options.cwd,
        env: safeGitEnv(options.env),
        timeout: options.timeoutMs ?? 60_000,
        maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
        killSignal: "SIGKILL",
        windowsHide: true,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (error) {
          const code =
            typeof (error as { code?: unknown }).code === "number"
              ? (error as { code: number }).code
              : null;
          const killed = (error as { killed?: boolean }).killed;
          const msg = killed
            ? `git ${args[0]} timed out`
            : `git ${args[0]} failed: ${scrub(String(stderr || error.message))
                .trim()
                .slice(0, 500)}`;
          reject(new GitError(msg, args, scrub(String(stderr)), code));
          return;
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      },
    );
    const onAbort = () => child.kill("SIGKILL");
    options.signal?.addEventListener("abort", onAbort, { once: true });
    child.on("exit", () => options.signal?.removeEventListener("abort", onAbort));
  });
}

/** Removes anything that looks like a token from URLs in git output. */
export function scrub(text: string): string {
  return text.replace(/(https?:\/\/)[^/@\s]+@/g, "$1***@");
}
