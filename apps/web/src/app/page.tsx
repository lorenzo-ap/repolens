import type { DemoResponse } from "@repolens/shared";
import { CATEGORY_LABELS } from "@repolens/shared";
import { ArrowRight, GitBranch, ListChecks, Network, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { SeverityBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GithubIcon } from "@/components/ui/icons";
import { ScoreRing, ScoreText } from "@/components/ui/score";
import { api } from "@/lib/api";
import { fmt, shortSha } from "@/lib/utils";

export const revalidate = 120;

async function loadDemo(): Promise<DemoResponse | null> {
  try {
    return await api.demo();
  } catch {
    return null;
  }
}

const MEASURES = [
  {
    title: "Code quality",
    body: "Linter and formatter setup, TypeScript strictness, explicit any, @ts-ignore, empty catch blocks, long functions, deep nesting.",
  },
  {
    title: "Complexity",
    body: "Cyclomatic and cognitive complexity per function from the TypeScript AST, with distribution and hotspots.",
  },
  {
    title: "Architecture",
    body: "Import graph at file and directory level, dependency cycles, hub modules, god files and instability.",
  },
  {
    title: "Dependencies",
    body: "Lockfile presence, duplicate versions, unbounded ranges, git dependencies, deprecated packages and registry advisories.",
  },
  {
    title: "Testing",
    body: "Test files and cases, test-to-source ratio, untested areas, committed .only and skipped tests.",
  },
  {
    title: "Git history",
    body: "Bus factor, activity, commit sizes and churn-times-complexity hotspots from the last 400 commits.",
  },
];

export default async function LandingPage() {
  const demo = await loadDemo();
  const analysis = demo?.latestAnalysis ?? null;
  const repo = demo?.repository ?? null;

  return (
    <div className="py-10 sm:py-16">
      <section className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div className="min-w-0">
          <p className="label-caps">Engineering intelligence for GitHub repositories</p>
          <h1 className="mt-3 max-w-xl text-2xl leading-[1.15] sm:text-3xl">
            Know where a codebase is healthy, where it is fragile, and what to fix first.
          </h1>
          <p className="mt-4 max-w-lg text-base text-fg-muted">
            RepoLens clones a repository, runs deterministic static analysis on the TypeScript AST,
            the dependency graph, the manifests and the Git history, and turns the result into one
            auditable health score with findings you can act on. No AI required.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button asChild variant="primary" size="lg">
              <Link href="/demo">
                Explore the demo <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg">
              <a href="/api/v1/auth/github">
                <GithubIcon /> Analyze my repositories
              </a>
            </Button>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-1 text-xs text-fg-subtle">
            <li className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-3.5" /> Never executes repository code
            </li>
            <li className="inline-flex items-center gap-1.5">
              <ListChecks className="size-3.5" /> Every number is reproducible
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Network className="size-3.5" /> TypeScript &amp; JavaScript AST
            </li>
          </ul>
        </div>

        <div className="min-w-0 rounded-lg border border-border bg-surface p-4 shadow-popover">
          {repo && analysis ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="label-caps">Demo · latest analysis</p>
                  <Link
                    href={`/r/${repo.owner}/${repo.name}`}
                    className="mt-0.5 block truncate font-mono text-sm text-fg hover:underline"
                  >
                    {repo.fullName}
                  </Link>
                  <p className="mt-0.5 text-xs text-fg-subtle">
                    {shortSha(analysis.commitSha)} · {fmt(analysis.findingSummary?.total)} findings
                  </p>
                </div>
                <ScoreRing score={analysis.healthScore} size={80} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                {analysis.categoryScores
                  ? Object.entries(analysis.categoryScores).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-fg-muted">
                          {CATEGORY_LABELS[k as keyof typeof CATEGORY_LABELS]}
                        </span>
                        <ScoreText score={v} />
                      </div>
                    ))
                  : null}
              </div>
              <div className="mt-4 border-t border-border pt-3">
                <p className="label-caps mb-2">Top findings</p>
                <ul className="space-y-1.5">
                  {demo?.topFindings.slice(0, 4).map((f) => (
                    <li key={f.id} className="flex items-start gap-2 text-xs">
                      <SeverityBadge severity={f.severity} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-fg">{f.title}</span>
                        {f.filePath ? (
                          <span className="block truncate font-mono text-2xs text-fg-subtle">
                            {f.filePath}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <Link
                href={`/r/${repo.owner}/${repo.name}/findings`}
                className="mt-3 inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                Open all findings <ArrowRight className="size-3" />
              </Link>
            </>
          ) : (
            <div className="py-10 text-center">
              <p className="text-sm font-semibold">Demo data is not seeded yet</p>
              <p className="mt-1 text-xs text-fg-muted">
                Run <code className="font-mono">pnpm seed:demo</code> to analyze a public repository
                with the real pipeline.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="mt-16 grid gap-6 sm:grid-cols-3">
        {[
          {
            step: "1",
            title: "Fetch",
            body: "A shallow, single-branch fetch into an isolated directory, with hooks disabled and hard limits on size, files and time.",
          },
          {
            step: "2",
            title: "Analyze",
            body: "Eight independent analyzers read the tree, the AST, the manifests, the lockfile and the Git log. Nothing from the repository is executed.",
          },
          {
            step: "3",
            title: "Act",
            body: "A weighted, fully inspectable score, ranked findings with evidence and recommendations, a module graph and history comparisons.",
          },
        ].map((s) => (
          <div key={s.step} className="rounded-md border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-sm bg-surface-2 font-mono text-xs text-fg-muted">
                {s.step}
              </span>
              <h2 className="text-base">{s.title}</h2>
            </div>
            <p className="mt-2 text-sm text-fg-muted">{s.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-16">
        <h2 className="text-lg">What it measures</h2>
        <p className="mt-1 max-w-2xl text-sm text-fg-muted">
          Every metric is computed from the repository at a specific commit. The score formula,
          weights and every input are shown next to the score.
        </p>
        <div className="mt-5 grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {MEASURES.map((m) => (
            <div key={m.title} className="bg-surface p-4">
              <h3 className="text-sm font-semibold">{m.title}</h3>
              <p className="mt-1 text-xs text-fg-muted">{m.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16 flex flex-col items-start justify-between gap-4 rounded-lg border border-border bg-surface p-6 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg">Built as an honest developer tool</h2>
          <p className="mt-1 max-w-xl text-sm text-fg-muted">
            Open source monorepo: Next.js, Fastify, PostgreSQL, Drizzle, ts-morph. The demo is
            produced by the same pipeline that analyzes your repositories.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="primary">
            <Link href="/demo">
              <GitBranch /> See the demo
            </Link>
          </Button>
          <Button asChild>
            <a href="https://github.com/lorenzo-ap/repolens" target="_blank" rel="noreferrer">
              <GithubIcon /> Source
            </a>
          </Button>
        </div>
      </section>
    </div>
  );
}
