import { lstat, readdir, readFile } from "node:fs/promises";
import { join, posix, sep } from "node:path";
import { LIMITS } from "@repolens/shared";
import type { RepoFile } from "../types";
import {
  extensionOf,
  isBinaryExtension,
  isGeneratedPath,
  isMinified,
  isSourceExtension,
  isTestPath,
  languageFor,
} from "./languages";

/** Directories never descended into. Matched against the directory basename. */
export const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".cache",
  "coverage",
  ".nyc_output",
  "vendor",
  "bower_components",
  ".yarn",
  ".pnpm-store",
  "__pycache__",
  ".venv",
  "venv",
  "target",
  ".idea",
  ".vscode",
  "tmp",
  "temp",
  ".DS_Store",
]);

/** Lockfiles and similar generated text that must not count toward lines of code. */
const IGNORED_FOR_LINES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "composer.lock",
  "Cargo.lock",
  "poetry.lock",
  "Gemfile.lock",
  "go.sum",
]);

export interface EnumerateOptions {
  maxFiles?: number;
  maxTextFileBytes?: number;
  signal?: AbortSignal;
}

export interface EnumerateResult {
  files: RepoFile[];
  truncated: boolean;
  skippedSymlinks: number;
}

function countLines(buf: Buffer): number {
  if (buf.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < buf.length; i++) if (buf[i] === 10) n++;
  if (buf[buf.length - 1] !== 10) n++;
  return n;
}

function looksBinary(buf: Buffer): boolean {
  const len = Math.min(buf.length, 8000);
  for (let i = 0; i < len; i++) if (buf[i] === 0) return true;
  return false;
}

/**
 * Walks the working tree breadth-first, never following symlinks, skipping build and dependency
 * directories, and stopping at `maxFiles`. Deterministic: entries are sorted by name.
 */
export async function enumerateFiles(
  rootDir: string,
  options: EnumerateOptions = {},
): Promise<EnumerateResult> {
  const maxFiles = options.maxFiles ?? LIMITS.maxFiles;
  const maxTextFileBytes = options.maxTextFileBytes ?? LIMITS.maxTextFileBytes;
  const files: RepoFile[] = [];
  let truncated = false;
  let skippedSymlinks = 0;
  const queue: string[] = [""];

  while (queue.length > 0) {
    if (options.signal?.aborted) break;
    const rel = queue.shift() as string;
    const abs = rel === "" ? rootDir : join(rootDir, rel);
    let entries: string[];
    try {
      entries = (await readdir(abs)).sort();
    } catch {
      continue;
    }
    for (const name of entries) {
      if (files.length >= maxFiles) {
        truncated = true;
        break;
      }
      const relPath = rel === "" ? name : `${rel}/${name}`;
      const absPath = join(rootDir, ...relPath.split("/"));
      let stat: Awaited<ReturnType<typeof lstat>>;
      try {
        stat = await lstat(absPath);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) {
        skippedSymlinks++;
        continue;
      }
      if (stat.isDirectory()) {
        if (IGNORED_DIRS.has(name)) continue;
        queue.push(relPath);
        continue;
      }
      if (!stat.isFile()) continue;
      const ext = extensionOf(name);
      const binaryExt = isBinaryExtension(ext);
      const language = binaryExt ? null : languageFor(relPath);
      let lines = 0;
      if (!binaryExt && !IGNORED_FOR_LINES.has(name) && stat.size <= maxTextFileBytes) {
        try {
          const buf = await readFile(absPath);
          lines = looksBinary(buf) ? 0 : countLines(buf);
        } catch {
          lines = 0;
        }
      }
      const isSource =
        isSourceExtension(ext) && !isMinified(relPath) && !isGeneratedPath(relPath) && lines > 0;
      files.push({
        path: relPath,
        absolutePath: absPath,
        size: stat.size,
        ext,
        language,
        lines,
        isTest: isTestPath(relPath),
        isSource,
      });
    }
    if (truncated) break;
  }
  return { files, truncated, skippedSymlinks };
}

export function toPosix(p: string): string {
  return sep === "/" ? p : p.split(sep).join(posix.sep);
}

/** Reads a text file relative to root, returning null when missing, too large, or unreadable. */
export async function readTextFile(
  rootDir: string,
  relPath: string,
  maxBytes = LIMITS.maxTextFileBytes,
): Promise<string | null> {
  try {
    const abs = join(rootDir, ...relPath.split("/"));
    const st = await lstat(abs);
    if (!st.isFile() || st.size > maxBytes) return null;
    return await readFile(abs, "utf8");
  } catch {
    return null;
  }
}

export function fileByPath(files: RepoFile[]): Map<string, RepoFile> {
  const m = new Map<string, RepoFile>();
  for (const f of files) m.set(f.path, f);
  return m;
}

export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function topLevelDir(path: string): string {
  const i = path.indexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}
