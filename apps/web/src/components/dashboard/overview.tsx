"use client";

import type { Category } from "@repolens/shared";
import { CATEGORIES, CATEGORY_LABELS, SEVERITIES } from "@repolens/shared";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SeverityBars } from "@/components/charts/bars";
import { HealthTrendChart } from "@/components/charts/trend-chart";
import { FindingRow } from "@/components/findings/finding-row";
import { useRepo } from "@/components/repo/context";
import { SeverityDot } from "@/components/ui/badge";
import { FilePath } from "@/components/ui/code";
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from "@/components/ui/feedback";
import { Bar, MetricList, MetricRow } from "@/components/ui/metric";
import { PageHeader } from "@/components/ui/page";
import { Panel, PanelFooter, PanelHeader } from "@/components/ui/panel";
import { HealthScore, ScoreRow } from "@/components/ui/score";
import { useFindings, useMetrics } from "@/lib/queries";
import { CATEGORY_ROUTE, fmt, formatDate, formatDuration, pct, shortSha } from "@/lib/utils";
import { ScoreBreakdown } from "./score-breakdown";

export function Overview() {
  const repo = useRepo();
  const { analysis, previous } = repo;
  const metrics = useMetrics(analysis?.id ?? null);
  const top = useFindings(analysis?.id ?? null, { limit: 6 });
  const router = useRouter();

  if (!analysis) {
    return (
      <>
        <PageHeader title="Overview" description={repo.repository.description ?? undefined} />
        <EmptyState
          title="No completed analysis yet"
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
                href={`${repo.base}/analyses/${repo.active.id}`}
                className="text-sm text-accent hover:underline"
              >
                View progress
              </Link>
            ) : null
          }
        />
      </>
    );
  }

  const m = metrics.data?.metrics ?? null;
  const s = m?.structure ?? null;
  const summary = analysis.findingSummary;
  const delta =
    previous && analysis.healthScore !== null && previous.healthScore !== null
      ? analysis.healthScore - previous.healthScore
      : null;

  return (
    <>
      <PageHeader
        title="Overview"
        description={repo.repository.description ?? undefined}
        meta={
          <>
            <span className="font-mono">{shortSha(analysis.commitSha)}</span>
            {analysis.branch ? <span>{analysis.branch}</span> : null}
            <span>{formatDate(analysis.commitDate ?? analysis.createdAt)}</span>
            {s ? (
              <span>
                {fmt(s.totalFiles)} files · {fmt(s.totalLines)} lines
              </span>
            ) : null}
            <span>analyzed in {formatDuration(analysis.durationMs)}</span>
          </>
        }
        actions={<ScoreBreakdown scoring={m?.scoring ?? null} />}
      />

      {/* Score and categories */}
      <section className="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]" aria-label="Health">
        <div>
          <HealthScore score={analysis.healthScore} delta={previous ? delta : undefined} />
          <div className="mt-5 border-t border-border pt-4">
            <div className="eyebrow">Findings</div>
            <p className="tabular mt-1.5 text-sm text-fg">
              <span className="text-2xl font-semibold leading-none">{fmt(summary?.total)}</span>
              <span className="ml-1.5 text-xs text-fg-tertiary">total</span>
            </p>
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-secondary">
              {SEVERITIES.filter((sev) => (summary?.bySeverity[sev] ?? 0) > 0).map((sev) => (
                <li key={sev}>
                  <Link
                    href={repo.href("findings", `severity=${sev}`)}
                    className="inline-flex items-center gap-1.5 hover:text-fg"
                  >
                    <SeverityDot severity={sev} />
                    <span className="tabular">{summary?.bySeverity[sev]}</span> {sev}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="eyebrow">Category scores</h2>
            {previous ? (
              <span className="text-2xs text-fg-tertiary">
                change vs {shortSha(previous.commitSha)}
              </span>
            ) : null}
          </div>
          <div className="hairlines">
            {CATEGORIES.map((c: Category) => (
              <ScoreRow
                key={c}
                label={CATEGORY_LABELS[c]}
                score={analysis.categoryScores?.[c] ?? null}
                delta={
                  previous
                    ? (analysis.categoryScores?.[c] ?? 0) - (previous.categoryScores?.[c] ?? 0)
                    : undefined
                }
                href={repo.href(CATEGORY_ROUTE[c])}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Trend and severity */}
      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel>
          <PanelHeader title="Health over time" description="click a point to view that analysis" />
          <div className="px-4 pb-3 pt-3">
            <HealthTrendChart
              analyses={repo.analyses}
              selectedId={analysis.id}
              onSelect={(id) =>
                router.push(
                  id === repo.latestCompleted?.id ? repo.base : `${repo.base}?analysis=${id}`,
                )
              }
            />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="By severity" />
          <div className="px-4 py-3">
            <SeverityBars
              summary={summary}
              onSelect={(sev) => router.push(repo.href("findings", `severity=${sev}`))}
            />
          </div>
        </Panel>
      </section>

      {/* Findings and hotspots */}
      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Top findings"
            description="most severe first"
            action={
              <Link
                href={repo.href("findings")}
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                All findings <ArrowRight className="size-3" aria-hidden />
              </Link>
            }
          />
          {top.isPending ? (
            <SkeletonRows rows={6} />
          ) : top.isError ? (
            <div className="p-4">
              <ErrorState error={top.error} onRetry={() => top.refetch()} compact />
            </div>
          ) : top.data.findings.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-fg-secondary">
              No findings for this commit.
            </p>
          ) : (
            <div className="hairlines">
              {top.data.findings.map((f) => (
                <FindingRow
                  key={f.id}
                  finding={f}
                  href={repo.href("findings", `finding=${f.id}`)}
                  showCategory={false}
                />
              ))}
            </div>
          )}
        </Panel>
        <Panel>
          <PanelHeader
            title="Hotspots"
            description="complex files that keep changing"
            action={
              <Link
                href={repo.href("git")}
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                Git history <ArrowRight className="size-3" aria-hidden />
              </Link>
            }
          />
          {metrics.isPending ? (
            <SkeletonRows rows={6} />
          ) : metrics.isError ? (
            <div className="p-4">
              <ErrorState error={metrics.error} onRetry={() => metrics.refetch()} compact />
            </div>
          ) : !m?.gitHistory?.available || m.gitHistory.hotspots.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-fg-secondary">
              {m?.gitHistory?.available
                ? "No hotspots: churn and complexity do not overlap."
                : "Git history was not available for this analysis."}
            </p>
          ) : (
            <div className="hairlines">
              {m.gitHistory.hotspots.slice(0, 6).map((h) => (
                <Link
                  key={h.file}
                  href={repo.href("findings", `path=${encodeURIComponent(h.file)}`)}
                  className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-bg-muted"
                >
                  <FilePath path={h.file} className="min-w-0 flex-1" />
                  <span className="tabular hidden w-20 shrink-0 whitespace-nowrap text-right text-xs text-fg-tertiary sm:block">
                    {h.commits} commits
                  </span>
                  <span className="tabular w-12 text-right text-xs text-fg-secondary">
                    cc {h.complexity}
                  </span>
                  <Bar
                    value={h.score}
                    max={Math.max(0.001, m.gitHistory?.hotspots[0]?.score ?? 1)}
                    tone="high"
                    className="w-14 shrink-0"
                  />
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </section>

      {/* Dependencies and testing summaries */}
      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Dependencies"
            action={<PanelLink href={repo.href("dependencies")} />}
          />
          <div className="px-4 py-1">
            {metrics.isPending ? (
              <Skeleton className="my-3 h-24" />
            ) : !m?.dependencies ? (
              <p className="py-6 text-sm text-fg-secondary">
                The dependencies analyzer did not run.
              </p>
            ) : (
              <MetricList>
                <MetricRow
                  label="Direct dependencies"
                  value={`${fmt(m.dependencies.direct)} + ${fmt(m.dependencies.directDev)} dev`}
                />
                <MetricRow
                  label="Lockfile"
                  value={m.dependencies.lockfilePresent ? m.dependencies.lockfileType : "missing"}
                  tone={m.dependencies.lockfilePresent ? undefined : "bad"}
                />
                <MetricRow
                  label="Known advisories"
                  hint="incl. transitive"
                  value={
                    m.dependencies.vulnerabilities
                      ? `${m.dependencies.vulnerabilities.critical + m.dependencies.vulnerabilities.high} high+ · ${m.dependencies.vulnerabilities.moderate + m.dependencies.vulnerabilities.low} other`
                      : "not checked"
                  }
                  tone={
                    m.dependencies.vulnerabilities
                      ? m.dependencies.vulnerabilities.critical +
                          m.dependencies.vulnerabilities.high >
                        0
                        ? "bad"
                        : "good"
                      : "muted"
                  }
                />
                <MetricRow
                  label="Unbounded ranges"
                  value={fmt(m.dependencies.unpinnedRanges.length)}
                  tone={m.dependencies.unpinnedRanges.length ? "warn" : undefined}
                />
                <MetricRow
                  label="Deprecated packages"
                  value={fmt(m.dependencies.deprecatedPackages.length)}
                  tone={m.dependencies.deprecatedPackages.length ? "warn" : undefined}
                />
              </MetricList>
            )}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Testing" action={<PanelLink href={repo.href("testing")} />} />
          <div className="px-4 py-1">
            {metrics.isPending ? (
              <Skeleton className="my-3 h-24" />
            ) : !m?.testing ? (
              <p className="py-6 text-sm text-fg-secondary">The testing analyzer did not run.</p>
            ) : (
              <MetricList>
                <MetricRow
                  label="Frameworks"
                  value={
                    m.testing.frameworks.length ? m.testing.frameworks.join(", ") : "none detected"
                  }
                  tone={m.testing.frameworks.length ? undefined : "bad"}
                />
                <MetricRow
                  label="Test files"
                  value={`${fmt(m.testing.testFiles)} of ${fmt(m.testing.sourceFiles)} source files`}
                />
                <MetricRow label="Test cases" value={fmt(m.testing.testCases)} />
                <MetricRow
                  label="Test-to-source lines"
                  value={pct(m.testing.testToSourceRatio)}
                  tone={
                    m.testing.testToSourceRatio >= 0.25
                      ? "good"
                      : m.testing.testToSourceRatio >= 0.1
                        ? "warn"
                        : "bad"
                  }
                />
                <MetricRow
                  label="Untested areas"
                  value={fmt(m.testing.sourceDirsWithoutTests.length)}
                  tone={m.testing.sourceDirsWithoutTests.length ? "warn" : "good"}
                />
              </MetricList>
            )}
          </div>
        </Panel>
      </section>

      <PanelFooterNote />
    </>
  );
}

function PanelLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
    >
      Details <ArrowRight className="size-3" aria-hidden />
    </Link>
  );
}

function PanelFooterNote() {
  const repo = useRepo();
  if (!repo.repository.isDemo) return null;
  return (
    <p className="mt-8 text-xs text-fg-tertiary">
      Demo data: this repository was analyzed by the same pipeline that runs for connected
      repositories. Nothing here is hand-written.
    </p>
  );
}

// Re-exported for pages that need the footer style without the panel header.
export { PanelFooter };
