import type { GitHistoryMetrics, Hotspot } from "@repolens/shared";
import { LIMITS } from "@repolens/shared";
import { finding, pluralize } from "../findings";
import { runGit } from "../git/run";
import type { Analyzer, AnalyzerContext, AnalyzerResult } from "../types";

interface Commit {
  sha: string;
  authorName: string;
  authorEmailHash: string;
  date: Date;
  isMerge: boolean;
  files: Array<{ path: string; added: number; deleted: number }>;
}

const RECORD_SEP = String.fromCharCode(0x1e);
const FIELD_SEP = String.fromCharCode(0x1f);
const STALE_DAYS = 180;
const LARGE_COMMIT_LINES = 1000;
const HOTSPOT_COUNT = 20;

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Parses `git log --numstat` output produced with the record/field separators above. */
export function parseGitLog(stdout: string): Commit[] {
  const commits: Commit[] = [];
  for (const record of stdout.split(RECORD_SEP)) {
    const trimmed = record.replace(/^\n+/, "");
    if (!trimmed.trim()) continue;
    const nl = trimmed.indexOf("\n");
    const header = nl === -1 ? trimmed : trimmed.slice(0, nl);
    const body = nl === -1 ? "" : trimmed.slice(nl + 1);
    const [sha, name, email, dateIso, parents] = header.split(FIELD_SEP);
    if (!sha || !dateIso) continue;
    const files: Commit["files"] = [];
    for (const line of body.split("\n")) {
      const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
      if (!m) continue;
      const added = m[1] === "-" ? 0 : Number(m[1]);
      const deleted = m[2] === "-" ? 0 : Number(m[2]);
      let path = m[3] ?? "";
      // Renames appear as `old => new` or `dir/{old => new}/file`; keep the new name.
      const brace = /\{(.*?) => (.*?)\}/.exec(path);
      if (brace) path = path.replace(brace[0], brace[2] ?? "");
      else if (path.includes(" => ")) path = path.split(" => ")[1] ?? path;
      files.push({ path, added, deleted });
    }
    commits.push({
      sha,
      authorName: (name ?? "unknown").trim() || "unknown",
      authorEmailHash: fnv1a((email ?? "").trim().toLowerCase()),
      date: new Date(dateIso),
      isMerge: (parents ?? "").trim().split(" ").filter(Boolean).length > 1,
      files,
    });
  }
  return commits;
}

function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function computeHistoryMetrics(
  commits: Commit[],
  complexityByFile: Map<string, number>,
  existingFiles: Set<string>,
  now: Date,
  truncated: boolean,
): GitHistoryMetrics {
  if (commits.length === 0) {
    return {
      available: false,
      commits: 0,
      truncated,
      firstCommit: null,
      lastCommit: null,
      activeDays: 0,
      authors: [],
      authorCount: 0,
      busFactor: 0,
      commitsPerWeek: [],
      churn: [],
      hotspots: [],
      mergeCommitShare: 0,
      avgCommitSize: 0,
      largeCommits: 0,
      daysSinceLastCommit: null,
    };
  }
  const sorted = [...commits].sort((a, b) => a.date.getTime() - b.date.getTime());
  const first = sorted[0] as Commit;
  const last = sorted[sorted.length - 1] as Commit;
  const days = new Set(sorted.map((c) => c.date.toISOString().slice(0, 10)));

  // Authors keyed by email hash so the same person with a changed display name is one author.
  const byAuthor = new Map<string, { name: string; commits: number }>();
  for (const c of commits) {
    const a = byAuthor.get(c.authorEmailHash) ?? { name: c.authorName, commits: 0 };
    a.commits++;
    byAuthor.set(c.authorEmailHash, a);
  }
  const authors = [...byAuthor.values()]
    .sort((a, b) => b.commits - a.commits || a.name.localeCompare(b.name))
    .map((a) => ({
      name: a.name,
      commits: a.commits,
      share: Math.round((a.commits / commits.length) * 1000) / 1000,
    }));
  let acc = 0;
  let busFactor = 0;
  for (const a of authors) {
    acc += a.commits;
    busFactor++;
    if (acc >= commits.length / 2) break;
  }

  const weeks = new Map<string, number>();
  const cutoff = new Date(now.getTime() - 26 * 7 * 86400000);
  for (const c of commits)
    if (c.date >= cutoff) weeks.set(isoWeek(c.date), (weeks.get(isoWeek(c.date)) ?? 0) + 1);
  // Fill missing weeks with zeros for a continuous series.
  const commitsPerWeek: Array<{ week: string; commits: number }> = [];
  for (let i = 25; i >= 0; i--) {
    const w = isoWeek(new Date(now.getTime() - i * 7 * 86400000));
    commitsPerWeek.push({ week: w, commits: weeks.get(w) ?? 0 });
  }

  const churnMap = new Map<string, { commits: number; added: number; deleted: number }>();
  let largeCommits = 0;
  let totalChanged = 0;
  for (const c of commits) {
    let size = 0;
    for (const f of c.files) {
      size += f.added + f.deleted;
      if (!existingFiles.has(f.path)) continue; // deleted files are not actionable
      const e = churnMap.get(f.path) ?? { commits: 0, added: 0, deleted: 0 };
      e.commits++;
      e.added += f.added;
      e.deleted += f.deleted;
      churnMap.set(f.path, e);
    }
    totalChanged += size;
    if (size > LARGE_COMMIT_LINES && !c.isMerge) largeCommits++;
  }
  const churn = [...churnMap.entries()]
    .map(([file, v]) => ({ file, ...v }))
    .sort(
      (a, b) =>
        b.commits - a.commits ||
        b.added + b.deleted - (a.added + a.deleted) ||
        a.file.localeCompare(b.file),
    )
    .slice(0, 50);

  // Hotspots: churn × complexity, both normalised to [0, 1] over the candidate set.
  const maxCommits = Math.max(1, ...churn.map((c) => c.commits));
  const maxComplexity = Math.max(1, ...[...complexityByFile.values()]);
  const hotspots: Hotspot[] = churn
    .filter((c) => (complexityByFile.get(c.file) ?? 0) > 0)
    .map((c) => {
      const complexity = complexityByFile.get(c.file) ?? 0;
      return {
        file: c.file,
        commits: c.commits,
        churn: c.added + c.deleted,
        complexity,
        score: Math.round((c.commits / maxCommits) * (complexity / maxComplexity) * 1000) / 1000,
      };
    })
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
    .slice(0, HOTSPOT_COUNT);

  const merges = commits.filter((c) => c.isMerge).length;
  return {
    available: true,
    commits: commits.length,
    truncated,
    firstCommit: first.date.toISOString(),
    lastCommit: last.date.toISOString(),
    activeDays: days.size,
    authors: authors.slice(0, 25),
    authorCount: authors.length,
    busFactor,
    commitsPerWeek,
    churn,
    hotspots,
    mergeCommitShare: Math.round((merges / commits.length) * 1000) / 1000,
    avgCommitSize: Math.round(totalChanged / Math.max(1, commits.length - merges)),
    largeCommits,
    daysSinceLastCommit: Math.max(0, Math.floor((now.getTime() - last.date.getTime()) / 86400000)),
  };
}

export const gitHistoryAnalyzer: Analyzer<GitHistoryMetrics> = {
  key: "gitHistory",
  critical: false,
  async run(ctx: AnalyzerContext): Promise<AnalyzerResult<GitHistoryMetrics>> {
    const format = `${RECORD_SEP}%H${FIELD_SEP}%an${FIELD_SEP}%ae${FIELD_SEP}%aI${FIELD_SEP}%P`;
    const { stdout } = await runGit(
      [
        "log",
        `--max-count=${LIMITS.maxCommits}`,
        "--numstat",
        "--no-color",
        "--no-renames",
        `--format=${format}`,
      ],
      { cwd: ctx.rootDir, timeoutMs: 60_000, signal: ctx.signal },
    );
    const commits = parseGitLog(stdout);
    const complexityByFile = new Map<string, number>();
    for (const fc of ctx.metrics.complexity?.fileComplexity ?? [])
      complexityByFile.set(fc.file, fc.sumCyclomatic);
    const existing = new Set(ctx.files.map((f) => f.path));
    const metrics = computeHistoryMetrics(
      commits,
      complexityByFile,
      existing,
      new Date(),
      commits.length >= LIMITS.maxCommits,
    );

    const findings = [];
    metrics.hotspots.slice(0, 5).forEach((h, i) => {
      findings.push(
        finding({
          ruleId: "git/hotspot",
          category: "gitHealth",
          severity: i < 3 ? "high" : "medium",
          title: `Hotspot: ${h.file}`,
          message: `${h.file} changed in ${pluralize(h.commits, "commit")} (${pluralize(h.churn, "line")} churned) and has a cyclomatic complexity sum of ${h.complexity}. Files that are both complex and frequently changed are where defects concentrate.`,
          filePath: h.file,
          symbol: "hotspot",
          evidence: {
            data: { commits: h.commits, churn: h.churn, complexity: h.complexity, score: h.score },
          },
          recommendation:
            "Prioritise refactoring and test coverage here; each change to this file carries above-average risk.",
        }),
      );
    });
    if (metrics.available && metrics.commits >= 20 && metrics.busFactor <= 2) {
      findings.push(
        finding({
          ruleId: "git/bus-factor",
          category: "gitHealth",
          severity: metrics.busFactor === 1 ? "high" : "medium",
          title: `Bus factor of ${metrics.busFactor}`,
          message: `${metrics.busFactor === 1 ? "A single author" : "Two authors"} account for half of the ${pluralize(metrics.commits, "commit")} analysed. Knowledge is concentrated and continuity depends on very few people.`,
          symbol: "bus-factor",
          evidence: {
            data: {
              busFactor: metrics.busFactor,
              authors: metrics.authorCount,
              commits: metrics.commits,
            },
          },
          recommendation:
            "Spread ownership through pair reviews and documentation of the areas only one person touches.",
        }),
      );
    }
    if (metrics.daysSinceLastCommit !== null && metrics.daysSinceLastCommit > STALE_DAYS) {
      findings.push(
        finding({
          ruleId: "git/stale",
          category: "gitHealth",
          severity: "medium",
          title: `No commits for ${pluralize(metrics.daysSinceLastCommit, "day")}`,
          message: `The last commit on the analysed branch is ${metrics.daysSinceLastCommit} days old. Dependencies and tooling are likely drifting out of date.`,
          symbol: "stale",
          recommendation:
            "Confirm the project is maintained; if it is archived, say so in the README.",
        }),
      );
    }
    if (metrics.largeCommits >= 5) {
      findings.push(
        finding({
          ruleId: "git/large-commits",
          category: "gitHealth",
          severity: "low",
          title: `${pluralize(metrics.largeCommits, "very large commit")}`,
          message: `${metrics.largeCommits} non-merge commits changed more than ${LARGE_COMMIT_LINES.toLocaleString("en-US")} lines. Large commits are hard to review and to bisect.`,
          symbol: "large-commits",
          recommendation:
            "Keep commits focused; split generated or vendored changes from logic changes.",
        }),
      );
    }

    return {
      metrics,
      findings,
      detail: metrics.available
        ? `${pluralize(metrics.commits, "commit")}${metrics.truncated ? "+" : ""}, ${pluralize(metrics.authorCount, "author")}, ${pluralize(metrics.hotspots.length, "hotspot")}`
        : "No git history available",
    };
  },
};
