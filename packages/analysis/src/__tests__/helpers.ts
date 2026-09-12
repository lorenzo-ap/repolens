import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "fixtures",
);

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_DATE: "2024-01-01T00:00:00Z",
  GIT_COMMITTER_DATE: "2024-01-01T00:00:00Z",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

function git(cwd: string, args: string[], date?: string): void {
  execFileSync("git", args, {
    cwd,
    env: date ? { ...GIT_ENV, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : GIT_ENV,
    stdio: "ignore",
  });
}

/**
 * Copies a fixture into a temporary directory and, optionally, builds a small deterministic git
 * history on top of it so the git analyzer has something to read.
 */
export function materializeFixture(
  name: string,
  options: { git?: boolean } = {},
): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "repolens-fixture-"));
  cpSync(join(FIXTURES_DIR, name), dir, { recursive: true });
  if (options.git) {
    git(dir, ["init", "-q", "-b", "main"]);
    git(dir, ["config", "user.email", "alice@example.com"]);
    git(dir, ["config", "user.name", "Alice"]);
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "initial"], "2024-01-01T00:00:00Z");
    // Two more commits touching the complex service file so it becomes a hotspot.
    execFileSync("sh", ["-c", "echo '// touch 1' >> src/services/orders.ts"], { cwd: dir });
    git(dir, ["commit", "-q", "-am", "touch orders 1"], "2024-02-01T00:00:00Z");
    git(dir, ["config", "user.email", "bob@example.com"]);
    git(dir, ["config", "user.name", "Bob"]);
    execFileSync("sh", ["-c", "echo '// touch 2' >> src/services/orders.ts"], { cwd: dir });
    git(dir, ["commit", "-q", "-am", "touch orders 2"], "2024-03-01T00:00:00Z");
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
