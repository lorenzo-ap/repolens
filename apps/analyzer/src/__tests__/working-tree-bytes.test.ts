import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { workingTreeBytes } from "../clone";

const LIMIT = 10 * 1024 * 1024;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "repolens-size-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(relative: string, size: number): void {
  const full = join(dir, relative);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, "x".repeat(size));
}

describe("workingTreeBytes", () => {
  it("sums files across nested directories", async () => {
    write("a.ts", 100);
    write("src/b.ts", 200);
    write("src/deep/c.ts", 300);
    await expect(workingTreeBytes(dir, LIMIT)).resolves.toBe(600);
  });

  it("ignores the .git directory at any depth", async () => {
    write("a.ts", 100);
    write(".git/objects/pack/huge.pack", 5_000);
    write("vendor/.git/config", 5_000);
    await expect(workingTreeBytes(dir, LIMIT)).resolves.toBe(100);
  });

  it("does not follow symbolic links", async () => {
    write("real/a.ts", 100);
    symlinkSync(join(dir, "real"), join(dir, "link"), "dir");
    await expect(workingTreeBytes(dir, LIMIT)).resolves.toBe(100);
  });

  it("stops counting once the limit is passed", async () => {
    // The total is only ever compared against the limit, so the walk is free to abandon a huge
    // tree as soon as the answer can no longer change. It reports at least the limit, not the
    // true size.
    for (let i = 0; i < 20; i += 1) write(`f${i}.bin`, 1_000);
    const bytes = await workingTreeBytes(dir, 4_500);
    expect(bytes).toBeGreaterThan(4_500);
    expect(bytes).toBeLessThan(20_000);
  });

  it("returns zero for an empty tree", async () => {
    await expect(workingTreeBytes(dir, LIMIT)).resolves.toBe(0);
  });
});
