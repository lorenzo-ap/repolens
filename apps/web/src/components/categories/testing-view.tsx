"use client";

import Link from "next/link";
import { useRepo } from "@/components/repo/context";
import { FilePath } from "@/components/ui/code";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Bar, Figure, MetricList, MetricRow } from "@/components/ui/metric";
import { PageHeader } from "@/components/ui/page";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { ScoreText } from "@/components/ui/score";
import { Table, TBody, Td, THead, Th, Tr } from "@/components/ui/table";
import { useFindings, useMetrics } from "@/lib/queries";
import { fmt, pct, scoreStatus } from "@/lib/utils";
import { FindingRow } from "../findings/finding-row";

export function TestingView() {
  const repo = useRepo();
  const metrics = useMetrics(repo.analysis?.id ?? null);
  const findings = useFindings(repo.analysis?.id ?? null, { category: ["testing"], limit: 20 });
  const t = metrics.data?.metrics.testing ?? null;
  const score = repo.analysis?.categoryScores?.testing ?? null;

  if (!repo.analysis) return <EmptyState title="No analysis yet" />;
  if (metrics.isPending)
    return (
      <>
        <PageHeader title="Testing" />
        <Skeleton className="h-24" />
        <Skeleton className="mt-6 h-64" />
      </>
    );
  if (metrics.isError)
    return <ErrorState error={metrics.error} onRetry={() => metrics.refetch()} />;
  if (!t) return <EmptyState title="Testing analyzer did not run" />;

  const ratioTone =
    t.testToSourceRatio >= 0.25 ? "good" : t.testToSourceRatio >= 0.1 ? "warn" : "bad";
  const maxUntested = Math.max(1, ...t.sourceDirsWithoutTests.map((a) => a.sourceFiles));

  return (
    <>
      <PageHeader
        title="Testing"
        description="Test volume and where it is missing, derived from test files, manifests and the AST."
        actions={
          <Link
            href={repo.href("findings", "category=testing")}
            className="text-xs text-accent hover:underline"
          >
            Testing findings
          </Link>
        }
      />

      <section className="grid gap-8 md:grid-cols-[180px_minmax(0,1fr)]">
        <div>
          <Figure
            label="Test health"
            value={<ScoreText score={score} className="text-2xl font-semibold" />}
            unit="/ 100"
            hint={scoreStatus(score)}
          />
          <Figure
            label="Test-to-source"
            value={pct(t.testToSourceRatio)}
            hint="lines of tests per line of source"
            className="mt-6"
          />
        </div>
        <MetricList columns={2}>
          <MetricRow
            label="Frameworks"
            value={t.frameworks.length ? t.frameworks.join(", ") : "none detected"}
            tone={t.frameworks.length ? undefined : "bad"}
          />
          <MetricRow label="Test files" value={fmt(t.testFiles)} />
          <MetricRow label="Test cases" hint="it / test calls" value={fmt(t.testCases)} />
          <MetricRow label="Source files" value={fmt(t.sourceFiles)} />
          <MetricRow label="Test lines" value={fmt(t.testLines)} />
          <MetricRow label="Source lines" value={fmt(t.sourceLines)} />
          <MetricRow
            label="Test-to-source ratio"
            value={t.testToSourceRatio.toFixed(2)}
            tone={ratioTone}
          />
          <MetricRow
            label="Areas with tests"
            value={`${t.sourceDirsWithTests} of ${t.sourceDirsWithTests + t.sourceDirsWithoutTests.length}`}
            tone={t.sourceDirsWithoutTests.length ? "warn" : "good"}
          />
          <MetricRow
            label="Focused (.only) tests"
            value={fmt(t.onlyTests)}
            tone={t.onlyTests ? "bad" : "good"}
          />
          <MetricRow
            label="Skipped tests"
            value={fmt(t.skippedTests)}
            tone={t.skippedTests ? "warn" : undefined}
          />
          <MetricRow
            label="Coverage configured"
            value={t.hasCoverageConfig ? "yes" : "no"}
            tone={t.hasCoverageConfig ? "good" : "muted"}
          />
          <MetricRow
            label="End-to-end tests"
            value={t.e2ePresent ? "present" : "none"}
            tone={t.e2ePresent ? "good" : "muted"}
          />
        </MetricList>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Untested areas" description="source directories with no test files" />
          {t.sourceDirsWithoutTests.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-fg-secondary">
              Every source area with five or more files has tests nearby.
            </p>
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Directory</Th>
                  <Th numeric>Source files</Th>
                  <Th className="w-28" />
                </tr>
              </THead>
              <TBody>
                {t.sourceDirsWithoutTests.map((a) => (
                  <Tr
                    key={a.path}
                    interactive
                    onClick={() =>
                      window.location.assign(
                        repo.href("findings", `path=${encodeURIComponent(a.path)}`),
                      )
                    }
                  >
                    <Td>
                      <FilePath path={`${a.path}/`} />
                    </Td>
                    <Td numeric>{fmt(a.sourceFiles)}</Td>
                    <Td>
                      <Bar value={a.sourceFiles} max={maxUntested} tone="medium" />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Panel>
        <Panel>
          <PanelHeader title="Testing findings" />
          {findings.isPending ? (
            <Skeleton className="m-4 h-32" />
          ) : findings.data?.findings.length ? (
            <div className="hairlines">
              {findings.data.findings.map((f) => (
                <FindingRow
                  key={f.id}
                  finding={f}
                  href={repo.href("findings", `category=testing&finding=${f.id}`)}
                  showCategory={false}
                />
              ))}
            </div>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-fg-secondary">No testing findings.</p>
          )}
        </Panel>
      </section>
    </>
  );
}
