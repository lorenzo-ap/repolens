"use client";

import Link from "next/link";
import { WeeklyCommitsChart } from "@/components/charts/bars";
import { useRepo } from "@/components/repo/context";
import { FilePath } from "@/components/ui/code";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Bar, Figure, MetricList, MetricRow } from "@/components/ui/metric";
import { PageHeader } from "@/components/ui/page";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { ScoreText } from "@/components/ui/score";
import { Table, TBody, Td, THead, Th, Tr } from "@/components/ui/table";
import { useMetrics } from "@/lib/queries";
import { fmt, formatDate, pct, scoreStatus } from "@/lib/utils";

export function GitView() {
  const repo = useRepo();
  const metrics = useMetrics(repo.analysis?.id ?? null);
  const g = metrics.data?.metrics.gitHistory ?? null;
  const score = repo.analysis?.categoryScores?.gitHealth ?? null;

  if (!repo.analysis) return <EmptyState title="No analysis yet" />;
  if (metrics.isPending)
    return (
      <>
        <PageHeader title="Git history" />
        <Skeleton className="h-24" />
        <Skeleton className="mt-6 h-96" />
      </>
    );
  if (metrics.isError)
    return <ErrorState error={metrics.error} onRetry={() => metrics.refetch()} />;
  if (!g?.available) return <EmptyState title="Git history was not available for this analysis" />;

  const recent = g.commitsPerWeek.slice(-12).reduce((a, w) => a + w.commits, 0);
  const maxHotspot = Math.max(0.001, ...g.hotspots.map((h) => h.score));
  const maxChurn = Math.max(1, ...g.churn.map((c) => c.commits));

  return (
    <>
      <PageHeader
        title="Git history"
        description={`Last ${fmt(g.commits)}${g.truncated ? "+" : ""} commits on the analyzed branch, ${formatDate(g.firstCommit)} to ${formatDate(g.lastCommit)}.`}
        actions={
          <Link
            href={repo.href("findings", "category=gitHealth")}
            className="text-xs text-accent hover:underline"
          >
            Git findings
          </Link>
        }
      />

      <section className="grid gap-8 md:grid-cols-[180px_minmax(0,1fr)]">
        <div>
          <Figure
            label="Git health"
            value={<ScoreText score={score} className="text-2xl font-semibold" />}
            unit="/ 100"
            hint={scoreStatus(score)}
          />
          <Figure
            label="Bus factor"
            value={fmt(g.busFactor)}
            hint="authors covering half of commits"
            className="mt-6"
          />
        </div>
        <MetricList columns={2}>
          <MetricRow
            label="Commits analyzed"
            value={`${fmt(g.commits)}${g.truncated ? "+" : ""}`}
          />
          <MetricRow label="Authors" value={fmt(g.authorCount)} />
          <MetricRow label="Active days" value={fmt(g.activeDays)} />
          <MetricRow
            label="Commits, last 12 weeks"
            value={fmt(recent)}
            tone={recent === 0 ? "warn" : undefined}
          />
          <MetricRow
            label="Days since last commit"
            value={fmt(g.daysSinceLastCommit)}
            tone={(g.daysSinceLastCommit ?? 0) > 180 ? "warn" : undefined}
          />
          <MetricRow
            label="Average commit size"
            hint="lines changed"
            value={fmt(g.avgCommitSize)}
          />
          <MetricRow
            label="Very large commits"
            hint="> 1,000 lines"
            value={fmt(g.largeCommits)}
            tone={g.largeCommits >= 5 ? "warn" : undefined}
          />
          <MetricRow label="Merge commits" value={pct(g.mergeCommitShare)} />
        </MetricList>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel>
          <PanelHeader title="Commit activity" description="commits per week, last 26 weeks" />
          <div className="px-4 pb-3 pt-3">
            <WeeklyCommitsChart data={g.commitsPerWeek} height={150} />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Contributors" description="share of analyzed commits" />
          <ul className="hairlines">
            {g.authors.slice(0, 8).map((a) => (
              <li key={a.name} className="flex items-center gap-3 px-4 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate text-fg">{a.name}</span>
                <Bar value={a.share} max={1} tone="accent" className="w-20 shrink-0" />
                <span className="tabular w-10 text-right text-fg-secondary">{pct(a.share)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      <Panel className="mt-6">
        <PanelHeader
          title="Hotspots"
          description="churn × complexity: files most likely to hide defects"
        />
        {g.hotspots.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-fg-secondary">
            No file is both complex and frequently changed.
          </p>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>File</Th>
                <Th numeric>Commits</Th>
                <Th numeric className="hidden sm:table-cell">
                  Lines churned
                </Th>
                <Th numeric>Σ complexity</Th>
                <Th className="hidden w-32 md:table-cell">Risk</Th>
              </tr>
            </THead>
            <TBody>
              {g.hotspots.map((h) => (
                <Tr
                  key={h.file}
                  interactive
                  onClick={() =>
                    window.location.assign(
                      repo.href("findings", `path=${encodeURIComponent(h.file)}`),
                    )
                  }
                >
                  <Td className="max-w-[420px]">
                    <FilePath path={h.file} />
                  </Td>
                  <Td numeric>{h.commits}</Td>
                  <Td numeric className="hidden text-fg-secondary sm:table-cell">
                    {fmt(h.churn)}
                  </Td>
                  <Td numeric>{h.complexity}</Td>
                  <Td className="hidden md:table-cell">
                    <Bar value={h.score} max={maxHotspot} tone="high" />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      <Panel className="mt-6">
        <PanelHeader
          title="Most changed files"
          description="commits touching each file in the analyzed range"
        />
        <Table>
          <THead>
            <tr>
              <Th>File</Th>
              <Th numeric>Commits</Th>
              <Th numeric className="hidden sm:table-cell">
                Added
              </Th>
              <Th numeric className="hidden sm:table-cell">
                Deleted
              </Th>
              <Th className="hidden w-32 md:table-cell" />
            </tr>
          </THead>
          <TBody>
            {g.churn.slice(0, 20).map((c) => (
              <Tr key={c.file}>
                <Td className="max-w-[420px]">
                  <FilePath path={c.file} />
                </Td>
                <Td numeric>{c.commits}</Td>
                <Td numeric className="hidden text-good sm:table-cell">
                  +{fmt(c.added)}
                </Td>
                <Td numeric className="hidden text-critical sm:table-cell">
                  −{fmt(c.deleted)}
                </Td>
                <Td className="hidden md:table-cell">
                  <Bar value={c.commits} max={maxChurn} />
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Panel>
    </>
  );
}
