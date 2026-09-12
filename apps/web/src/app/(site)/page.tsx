import type { DemoResponse } from "@repolens/shared";
import { CATEGORIES, CATEGORY_LABELS } from "@repolens/shared";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GithubIcon } from "@/components/ui/icons";
import { Delta, ScoreBar, ScoreText } from "@/components/ui/score";
import { api } from "@/lib/api";
import { fmt, scoreStatus, shortSha } from "@/lib/utils";

export const revalidate = 120;

async function loadDemo(): Promise<DemoResponse | null> {
  try {
    return await api.demo();
  } catch {
    return null;
  }
}

const MEASURES = [
  [
    "Architecture",
    "Import graph at file and directory level, dependency cycles, hub modules, fan-in and fan-out.",
  ],
  [
    "Code quality",
    "Linter and formatter setup, TypeScript strictness, explicit any, @ts-ignore, empty catch blocks, long functions.",
  ],
  [
    "Complexity",
    "Cyclomatic and cognitive complexity of every function, with distributions and the worst offenders.",
  ],
  [
    "Dependencies",
    "Lockfile hygiene, unbounded ranges, git dependencies, deprecated packages and registry advisories.",
  ],
  [
    "Testing",
    "Test files and cases, test-to-source ratio, untested areas, focused and skipped tests.",
  ],
  [
    "Git history",
    "Bus factor, activity, commit sizes and churn-times-complexity hotspots over the last 400 commits.",
  ],
] as const;

export default async function LandingPage() {
  const demo = await loadDemo();
  const analysis = demo?.latestAnalysis ?? null;
  const repo = demo?.repository ?? null;
  const demoHref = repo ? `/r/${repo.owner}/${repo.name}` : "/demo";

  return (
    <div className="pb-8 pt-16 sm:pt-24">
      <section className="max-w-2xl">
        <p className="eyebrow">Engineering intelligence for GitHub repositories</p>
        <h1 className="mt-4 text-3xl leading-[1.1] tracking-[-0.02em] sm:text-4xl">
          Understand your codebase before you change it.
        </h1>
        <p className="mt-5 max-w-xl text-base text-fg-secondary">
          RepoLens analyzes architecture, code quality, dependencies, testing, complexity and Git
          history from a GitHub repository and turns the result into one auditable health score with
          findings you can act on. Deterministic static analysis, no AI required, never executes
          your code.
        </p>
        <div className="mt-7 flex flex-wrap gap-2">
          <Button asChild variant="primary" size="lg">
            <Link href={demoHref}>
              Explore demo <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg">
            <a href="/api/v1/auth/github">
              <GithubIcon /> Connect GitHub
            </a>
          </Button>
        </div>
      </section>

      <section className="mt-14" aria-label="Product preview">
        <div className="overflow-hidden rounded-lg border border-border bg-bg shadow-md">
          <div className="flex h-9 items-center gap-2 border-b border-border bg-bg-subtle px-3">
            <span className="flex gap-1.5" aria-hidden>
              <span className="size-2.5 rounded-full bg-border-strong" />
              <span className="size-2.5 rounded-full bg-border-strong" />
              <span className="size-2.5 rounded-full bg-border-strong" />
            </span>
            <span className="mx-auto rounded-sm bg-bg px-8 py-0.5 font-mono text-2xs text-fg-tertiary">
              repolens.app/r/{repo?.fullName ?? "owner/repo"}
            </span>
          </div>
          {/* biome-ignore lint/performance/noImgElement: static preview captured from the product */}
          <img
            src="/preview-light.png"
            alt="RepoLens overview for the demo repository: health score, category scores, trend and findings"
            className="block w-full dark:hidden"
            width={1440}
            height={900}
          />
          {/* biome-ignore lint/performance/noImgElement: static preview captured from the product */}
          <img
            src="/preview-dark.png"
            alt=""
            className="hidden w-full dark:block"
            width={1440}
            height={900}
            aria-hidden
          />
        </div>
      </section>

      {repo && analysis ? (
        <section
          className="mt-16 grid gap-8 md:grid-cols-[minmax(0,1fr)_360px]"
          aria-label="Live demo summary"
        >
          <div>
            <p className="eyebrow">Live demo</p>
            <h2 className="mt-2 text-xl">{repo.fullName}, analyzed by the real pipeline</h2>
            <p className="mt-2 max-w-lg text-sm text-fg-secondary">
              The demo is a public open-source repository analyzed at several release tags. Every
              number, finding and graph on those pages was produced by the same analyzers that run
              for connected repositories. Nothing is hand-written.
            </p>
            <Link
              href={demoHref}
              className="mt-4 inline-flex items-center gap-1 text-sm text-accent hover:underline"
            >
              Open {repo.name} <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          <div className="rounded-md border border-border p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="eyebrow">Health score</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="tabular text-3xl font-semibold leading-none">
                    {Math.round(analysis.healthScore ?? 0)}
                  </span>
                  <span className="text-xs text-fg-tertiary">/ 100</span>
                </div>
                <div className="mt-1 text-sm text-fg-secondary">
                  {scoreStatus(analysis.healthScore)}
                </div>
              </div>
              <div className="text-right text-xs text-fg-tertiary">
                <div className="font-mono">{shortSha(analysis.commitSha)}</div>
                <div>{fmt(analysis.findingSummary?.total)} findings</div>
              </div>
            </div>
            <ScoreBar score={analysis.healthScore} className="mt-3" height="h-1.5" />
            <ul className="mt-4 space-y-1.5">
              {CATEGORIES.map((c) => (
                <li key={c} className="flex items-center justify-between text-xs">
                  <span className="text-fg-secondary">{CATEGORY_LABELS[c]}</span>
                  <span className="flex items-center gap-3">
                    <ScoreBar score={analysis.categoryScores?.[c] ?? null} className="w-20" />
                    <ScoreText
                      score={analysis.categoryScores?.[c] ?? null}
                      className="w-6 text-right"
                    />
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 text-2xs text-fg-tertiary">
              <Delta value={null} className="sr-only" />
              Scores are computed from the repository at the analyzed commit.
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-16 border-t border-border pt-10">
        <h2 className="text-lg">What it measures</h2>
        <p className="mt-1 max-w-2xl text-sm text-fg-secondary">
          Seven category scores, each derived from concrete metrics with a documented formula. The
          full derivation, inputs and weights are one click away from the score.
        </p>
        <dl className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {MEASURES.map(([title, body]) => (
            <div key={title} className="border-t border-border pt-3">
              <dt className="text-sm font-semibold text-fg">{title}</dt>
              <dd className="mt-1 text-sm text-fg-secondary">{body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-16 border-t border-border pt-10">
        <div className="grid gap-8 md:grid-cols-3">
          {[
            [
              "Fetch",
              "A shallow, single-branch fetch into an isolated directory. Hooks, prompts and non-HTTPS protocols are disabled; size, file count and time are capped.",
            ],
            [
              "Analyze",
              "Eight analyzers read the tree, the TypeScript AST, the manifests, the lockfile and the Git log. Nothing from the repository is ever executed.",
            ],
            [
              "Act",
              "A weighted, inspectable score, ranked findings with evidence and a recommendation, an interactive module graph, and comparisons between analyses.",
            ],
          ].map(([title, body], i) => (
            <div key={title}>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-fg-tertiary">0{i + 1}</span>
                <h3 className="text-sm font-semibold">{title}</h3>
              </div>
              <p className="mt-2 text-sm text-fg-secondary">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-border pt-6 text-xs text-fg-tertiary sm:flex-row sm:items-center">
        <span>Open source · Next.js, Fastify, PostgreSQL, Drizzle, ts-morph</span>
        <div className="flex gap-4">
          <Link href={demoHref} className="hover:text-fg">
            Demo
          </Link>
          <a
            href="https://github.com/lorenzo-ap/repolens"
            target="_blank"
            rel="noreferrer"
            className="hover:text-fg"
          >
            Source
          </a>
        </div>
      </footer>
    </div>
  );
}
