import type { Category, Severity } from "@repolens/shared";
import { type ClassValue, clsx } from "clsx";
import { formatDistanceToNowStrict } from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const nf = new Intl.NumberFormat("en-US");
export function fmt(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return digits > 0
    ? n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 })
    : nf.format(Math.round(n));
}

export function pct(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined) return "–";
  return `${(n * 100).toFixed(digits)}%`;
}

export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : "–";
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  return `${formatDistanceToNowStrict(new Date(iso))} ago`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "–";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

export function formatBytesKb(kb: number | null | undefined): string {
  if (kb === null || kb === undefined) return "–";
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export type ScoreBand = "good" | "medium" | "high" | "critical" | "none";

export function scoreBand(score: number | null | undefined): ScoreBand {
  if (score === null || score === undefined) return "none";
  if (score >= 80) return "good";
  if (score >= 60) return "medium";
  if (score >= 40) return "high";
  return "critical";
}

/** Qualitative word shown next to a score. */
export function scoreStatus(score: number | null | undefined): string {
  if (score === null || score === undefined) return "Not available";
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Good";
  if (score >= 65) return "Fair";
  if (score >= 50) return "Poor";
  return "Critical";
}

export const SEVERITY_FULL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

export const CATEGORY_DESCRIPTION: Record<Category, string> = {
  quality:
    "Lint and formatter setup, TypeScript strictness, unsafe constructs, long functions, empty catch blocks.",
  complexity: "Cyclomatic and cognitive complexity of functions across the codebase.",
  architecture: "Module dependency graph: cycles, hub modules, god files and fan-out.",
  dependencies: "Lockfile hygiene, version ranges, deprecated packages and known advisories.",
  testing: "Test volume, coverage of source areas, focused and skipped tests.",
  maintainability: "Documentation, duplication, file sizes, TODO density and dead exports.",
  gitHealth: "Bus factor, recency, commit sizes and change hotspots.",
};

/** Route for each category's dedicated page within a repository. */
export const CATEGORY_ROUTE: Record<Category, string> = {
  quality: "findings?category=quality",
  complexity: "complexity",
  architecture: "architecture",
  dependencies: "dependencies",
  testing: "testing",
  maintainability: "findings?category=maintainability",
  gitHealth: "git",
};

export function truncateMiddle(text: string, max = 48): string {
  if (text.length <= max) return text;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}

export function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
}

/** Appends a query string (without leading ?) to a path that may already have one. */
export function withQuery(path: string, query: string): string {
  if (!query) return path;
  return path.includes("?") ? `${path}&${query}` : `${path}?${query}`;
}
