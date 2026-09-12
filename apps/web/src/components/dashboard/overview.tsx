"use client";

import type { AnalysisSummary, Category, MetricsDocument } from "@repolens/shared";
import { CATEGORIES, CATEGORY_LABELS } from "@repolens/shared";
import { ArrowRight, Flame, Package, TestTube2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SeverityBars } from "@/components/charts/bars";
import { HealthTrendChart } from "@/components/charts/trend-chart";
import { useRepo } from "@/components/repo/context";
import { SeverityBadge } from "@/components/ui/badge";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Tooltip } from "@/components/ui/overlay";
import { Delta, ScoreBar, ScoreRing, ScoreText } from "@/components/ui/score";
import { useFindings, useMetrics } from "@/lib/queries";
import {
  CATEGORY_DESCRIPTION,
  cn,
  fmt,
  formatDuration,
  pct,
  relativeTime,
  shortSha,
  truncateMiddle,
} from "@/lib/utils";
import { ScoreBreakdown } from "./score-breakdown";

function previousOf(list: AnalysisSummary[], current: AnalysisSummary): AnalysisSummary | null {
  const completed = list
    .filter((a) => a.status === "completed")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const idx = completed.findIndex((a) => a.id === current.id);
  return idx > 0 ? (completed[idx - 1] ?? null) : null;
}

export function Overview() {
  const repo = useRepo();
  const { analysis } = repo;
  const metrics = useMetrics(analysis?.id ?? null);
  const top = useFindings(analysis?.id ?? null, { limit: 6 });
  const router = useRouter();
  const base = `/r/${repo.owner}/${repo.name}`;
  const q = repo.preserveQuery ? `&${repo.preserveQuery}` : "";

  if (!analysis) {
    return (
      <EmptyState
        title="No analysis to show yet"
        description={
          repo.active
            ? "An analysis is running. This page fills in as soon as it completes."
            : repo.repository.canManage
              ? "Run the first analysis to see the health score, findings, architecture and history."
              : "This repository has not been analyzed."
        }
        action={
          repo.active ? (
            <Link
              href={`${base}/analyses/${repo.active.id}`}
              className="text-sm text-accent hover:underline"
            >
              View progress
            </Link>
          ) : null
        }
      />
    );
  }
  const previous = previousOf(repo.analyses, analysis);
  const m = metrics.data?.metrics ?? null;

  return (
    <div className="space-y-4">
      {/* Row 1: score + categories */}
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardBody className="flex items-center gap-5">
            <ScoreRing score={analysis.healthScore} size={104} />
            <div className="min-w-0">
              <p className="label-caps">Health score</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="tabular text-2xl font-semibold">
                  {analysis.healthScore === null ? "–" : Math.round(analysis.healthScore)}
                </span>
                <Delta
                  value={
                    previous && analysis.healthScore !== null && previous.healthScore !== null
                      ? analysis.healthScore - previous.healthScore
                      : null
                  }
                  digits={1}
                />
              </div>
              <p className="mt-1 text-xs text-fg-subtle">
                {shortSha(analysis.commitSha)} ·{" "}
                {relativeTime(analysis.finishedAt ?? analysis.createdAt)} ·{" "}
                {formatDuration(analysis.durationMs)}
              </p>
            </div>
          </CardBody>
          <CardFooter className="flex items-center justify-between">
            <span>
              {previous ? `vs previous (${shortSha(previous.commitSha)})` : "First analysis"}
            </span>
            <ScoreBreakdown scoring={m?.scoring ?? null} />
          </CardFooter>
        </Card>
        <Card>
          <CardBody className="grid h-full grid-cols-2 content-center gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            {CATEGORIES.map((c) => (
              <CategoryTile
                key={c}
                category={c}
                score={analysis.categoryScores?.[c] ?? null}
                previous={previous?.categoryScores?.[c] ?? null}
                href={`${base}/findings?category=${c}${q}`}
              />
            ))}
          </CardBody>
        </Card>
      </div>

      {/* Row 2: trend + severity */}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader
            title="Health trend"
            description="Completed analyses of this repository. Click a point to view that analysis."
          />
          <CardBody className="pt-2">
            <HealthTrendChart
              analyses={repo.analyses}
              selectedId={analysis.id}
              onSelect={(id) =>
                router.push(id === repo.latestCompleted?.id ? base : `${base}?analysis=${id}`)
              }
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Findings by severity"
            description={`${fmt(analysis.findingSummary?.total)} findings in total`}
          />
          <CardBody>
            <SeverityBars
              summary={analysis.findingSummary}
              onSelect={(s) => router.push(`${base}/findings?severity=${s}${q}`)}
            />
          </CardBody>
        </Card>
      </div>

      {/* Row 3: top findings + hotspots */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Top findings"
            description="Most severe first"
            action={
              <Link
                href={`${base}/findings${repo.preserveQuery ? `?${repo.preserveQuery}` : ""}`}
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                All findings <ArrowRight className="size-3" />
              </Link>
            }
          />
          {top.isPending ? (
            <CardBody className="space-y-2">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={`tf-${i.toString()}`} className="h-9" />
              ))}
            </CardBody>
          ) : top.isError ? (
            <CardBody>
              <ErrorState error={top.error} onRetry={() => top.refetch()} compact />
            </CardBody>
          ) : top.data.findings.length === 0 ? (
            <CardBody>
              <p className="py-6 text-center text-sm text-fg-muted">No findings. Nice.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {top.data.findings.map((f) => (
                <li key={f.id}>
                  <Link
                    href={`${base}/findings?finding=${f.id}${q}`}
                    className="flex items-start gap-3 px-4 py-2.5 hover:bg-surface-2"
                  >
                    <SeverityBadge severity={f.severity} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-fg">{f.title}</span>
                      <span className="block truncate font-mono text-2xs text-fg-subtle">
                        {f.filePath ? `${f.filePath}${f.line ? `:${f.line}` : ""}` : f.ruleId}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader
            title="Hotspots"
            description="Files that are both complex and frequently changed"
            action={<Flame className="size-4 text-fg-subtle" aria-hidden />}
          />
          {metrics.isPending ? (
            <CardBody className="space-y-2">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={`hs-${i.toString()}`} className="h-8" />
              ))}
            </CardBody>
          ) : metrics.isError ? (
            <CardBody>
              <ErrorState error={metrics.error} onRetry={() => metrics.refetch()} compact />
            </CardBody>
          ) : !m?.gitHistory?.available || m.gitHistory.hotspots.length === 0 ? (
            <CardBody>
              <p className="py-6 text-center text-sm text-fg-muted">
                {m?.gitHistory?.available
                  ? "No hotspots: churn and complexity do not overlap."
                  : "Git history was not available for this analysis."}
              </p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {m.gitHistory.hotspots.slice(0, 8).map((h) => (
                <li key={h.file} className="flex items-center gap-3 px-4 py-2">
                  <Link
                    href={`${base}/findings?path=${encodeURIComponent(h.file)}${q}`}
                    className="min-w-0 flex-1 truncate font-mono text-xs text-fg hover:underline"
                    title={h.file}
                  >
                    {truncateMiddle(h.file, 56)}
                  </Link>
                  <Tooltip
                    content={`${h.commits} commits, ${fmt(h.churn)} lines churned, complexity sum ${h.complexity}`}
                  >
                    <span className="tabular shrink-0 text-xs text-fg-muted">
                      {h.commits}c · cc {h.complexity}
                    </span>
                  </Tooltip>
                  <span
                    className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-3"
                    aria-hidden
                  >
                    <span
                      className="block h-full rounded-full bg-high"
                      style={{ width: `${Math.max(6, h.score * 100)}%` }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Row 4: dependency + testing summaries */}
      <div className="grid gap-4 lg:grid-cols-2">
        <DependencyCard m={m} loading={metrics.isPending} base={base} q={q} />
        <TestingCard m={m} loading={metrics.isPending} base={base} q={q} />
      </div>
    </div>
  );
}

function CategoryTile({
  category,
  score,
  previous,
  href,
}: {
  category: Category;
  score: number | null;
  previous: number | null;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group block min-w-0 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Tooltip content={CATEGORY_DESCRIPTION[category]} side="bottom">
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-fg-muted group-hover:text-fg">
              {CATEGORY_LABELS[category]}
            </span>
            <Delta
              value={score !== null && previous !== null ? score - previous : null}
              digits={0}
              className="text-2xs"
            />
          </div>
          <div className="mt-0.5 flex items-baseline gap-1">
            <ScoreText score={score} className="text-lg" />
            <span className="text-2xs text-fg-subtle">/100</span>
          </div>
          <ScoreBar score={score} className="mt-1.5" />
        </div>
      </Tooltip>
    </Link>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "good" | "bad" | "warn";
}) {
  return (
    <div className="min-w-0">
      <div className="text-2xs uppercase tracking-[0.04em] text-fg-subtle">{label}</div>
      <div
        className={cn(
          "tabular mt-0.5 truncate text-sm font-medium",
          tone === "good" && "text-good",
          tone === "bad" && "text-critical",
          tone === "warn" && "text-medium",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function DependencyCard({
  m,
  loading,
  base,
  q,
}: {
  m: MetricsDocument | null;
  loading: boolean;
  base: string;
  q: string;
}) {
  const d = m?.dependencies ?? null;
  const v = d?.vulnerabilities ?? null;
  return (
    <Card>
      <CardHeader
        title="Dependency health"
        description={
          d
            ? `${d.lockfileType === "none" ? "No lockfile" : `${d.lockfileType} lockfile`} · ${fmt(d.resolvedPackages)} resolved packages`
            : undefined
        }
        action={
          <Link
            href={`${base}/findings?category=dependencies${q}`}
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            <Package className="size-3.5" /> Findings
          </Link>
        }
      />
      <CardBody>
        {loading ? (
          <Skeleton className="h-16" />
        ) : !d ? (
          <p className="text-sm text-fg-muted">The dependencies analyzer did not run.</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <Stat label="Direct" value={`${fmt(d.direct)} + ${fmt(d.directDev)} dev`} />
            <Stat
              label="Lockfile"
              value={d.lockfilePresent ? "Committed" : "Missing"}
              tone={d.lockfilePresent ? "good" : "bad"}
            />
            <Stat
              label="Advisories (incl. transitive)"
              value={
                v ? `${v.critical + v.high} high+ · ${v.moderate + v.low} other` : "Not checked"
              }
              tone={
                v
                  ? v.critical + v.high > 0
                    ? "bad"
                    : v.moderate + v.low > 0
                      ? "warn"
                      : "good"
                  : undefined
              }
            />
            <Stat
              label="Hygiene"
              value={`${d.unpinnedRanges.length} unbounded · ${d.deprecatedPackages.length} deprecated`}
              tone={d.unpinnedRanges.length + d.deprecatedPackages.length > 0 ? "warn" : "good"}
            />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function TestingCard({
  m,
  loading,
  base,
  q,
}: {
  m: MetricsDocument | null;
  loading: boolean;
  base: string;
  q: string;
}) {
  const t = m?.testing ?? null;
  return (
    <Card>
      <CardHeader
        title="Testing health"
        description={
          t
            ? t.frameworks.length
              ? t.frameworks.join(", ")
              : "No test framework detected"
            : undefined
        }
        action={
          <Link
            href={`${base}/findings?category=testing${q}`}
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            <TestTube2 className="size-3.5" /> Findings
          </Link>
        }
      />
      <CardBody>
        {loading ? (
          <Skeleton className="h-16" />
        ) : !t ? (
          <p className="text-sm text-fg-muted">The testing analyzer did not run.</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <Stat label="Test files" value={`${fmt(t.testFiles)} / ${fmt(t.sourceFiles)} src`} />
            <Stat label="Test cases" value={fmt(t.testCases)} />
            <Stat
              label="Test:source lines"
              value={pct(t.testToSourceRatio)}
              tone={
                t.testToSourceRatio >= 0.25 ? "good" : t.testToSourceRatio >= 0.1 ? "warn" : "bad"
              }
            />
            <Stat
              label="Untested areas"
              value={fmt(t.sourceDirsWithoutTests.length)}
              tone={t.sourceDirsWithoutTests.length ? "warn" : "good"}
            />
          </div>
        )}
      </CardBody>
    </Card>
  );
}
