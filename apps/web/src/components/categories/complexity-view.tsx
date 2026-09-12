"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DistributionBars } from "@/components/charts/bars";
import { useRepo } from "@/components/repo/context";
import { FilePath } from "@/components/ui/code";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { SegmentedControl } from "@/components/ui/input";
import { Bar, Figure, MetricList, MetricRow } from "@/components/ui/metric";
import { PageHeader } from "@/components/ui/page";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { ScoreText } from "@/components/ui/score";
import { Table, TBody, Td, THead, Th, Tr } from "@/components/ui/table";
import { useMetrics } from "@/lib/queries";
import { fmt, scoreStatus } from "@/lib/utils";

type SortKey = "cyclomatic" | "cognitive" | "loc";

export function ComplexityView() {
  const repo = useRepo();
  const metrics = useMetrics(repo.analysis?.id ?? null);
  const [sort, setSort] = useState<SortKey>("cyclomatic");
  const c = metrics.data?.metrics.complexity ?? null;
  const score = repo.analysis?.categoryScores?.complexity ?? null;
  const top = useMemo(
    () => (c ? [...c.topFunctions].sort((a, b) => b[sort] - a[sort]) : []),
    [c, sort],
  );

  if (!repo.analysis) return <EmptyState title="No analysis yet" />;
  if (metrics.isPending)
    return (
      <>
        <PageHeader title="Complexity" />
        <Skeleton className="h-24" />
        <Skeleton className="mt-6 h-96" />
      </>
    );
  if (metrics.isError)
    return <ErrorState error={metrics.error} onRetry={() => metrics.refetch()} />;
  if (!c) return <EmptyState title="Complexity analyzer did not run" />;

  const maxTop = Math.max(1, ...top.map((f) => f[sort]));
  const maxFile = Math.max(1, ...c.fileComplexity.map((f) => f.sumCyclomatic));
  const distribution = (["1-5", "6-10", "11-20", "21-50", "51+"] as const).map((bucket) => ({
    bucket,
    count: c.distribution[bucket],
  }));

  return (
    <>
      <PageHeader
        title="Complexity"
        description="Cyclomatic and cognitive complexity of every function, computed from the TypeScript AST."
        actions={
          <Link
            href={repo.href("findings", "category=complexity")}
            className="text-xs text-accent hover:underline"
          >
            Complexity findings
          </Link>
        }
      />

      <section className="grid gap-8 md:grid-cols-[180px_minmax(0,1fr)_260px]">
        <div>
          <Figure
            label="Complexity score"
            value={<ScoreText score={score} className="text-2xl font-semibold" />}
            unit="/ 100"
            hint={scoreStatus(score)}
          />
          <Figure label="Functions" value={fmt(c.functions)} className="mt-6" />
        </div>
        <MetricList columns={2}>
          <MetricRow
            label="Average cyclomatic"
            value={c.avgCyclomatic.toFixed(2)}
            tone={c.avgCyclomatic <= 4 ? "good" : c.avgCyclomatic <= 8 ? "warn" : "bad"}
          />
          <MetricRow label="Average cognitive" value={c.avgCognitive.toFixed(2)} />
          <MetricRow
            label="90th percentile cyclomatic"
            value={fmt(c.p90Cyclomatic)}
            tone={c.p90Cyclomatic <= 10 ? "good" : c.p90Cyclomatic <= 20 ? "warn" : "bad"}
          />
          <MetricRow label="90th percentile cognitive" value={fmt(c.p90Cognitive)} />
          <MetricRow label="Highest cyclomatic" value={fmt(c.maxCyclomatic)} />
          <MetricRow label="Highest cognitive" value={fmt(c.maxCognitive)} />
          <MetricRow
            label="Functions above 20"
            value={fmt(c.distribution["21-50"] + c.distribution["51+"])}
            tone={c.distribution["21-50"] + c.distribution["51+"] ? "warn" : "good"}
          />
          <MetricRow
            label="Functions above 50"
            value={fmt(c.distribution["51+"])}
            tone={c.distribution["51+"] ? "bad" : "good"}
          />
        </MetricList>
        <div>
          <div className="eyebrow mb-2">Cyclomatic distribution</div>
          <DistributionBars data={distribution} label="Functions by cyclomatic complexity" />
        </div>
      </section>

      <Panel className="mt-8">
        <PanelHeader
          title="Most complex functions"
          description="top 25"
          action={
            <SegmentedControl
              aria-label="Sort by"
              value={sort}
              onChange={setSort}
              options={[
                { value: "cyclomatic", label: "Cyclomatic" },
                { value: "cognitive", label: "Cognitive" },
                { value: "loc", label: "Lines" },
              ]}
            />
          }
        />
        <Table>
          <THead>
            <tr>
              <Th>Function</Th>
              <Th>File</Th>
              <Th numeric>Cyclomatic</Th>
              <Th numeric>Cognitive</Th>
              <Th numeric className="hidden sm:table-cell">
                Lines
              </Th>
              <Th className="hidden w-32 md:table-cell" />
            </tr>
          </THead>
          <TBody>
            {top.map((f) => (
              <Tr
                key={`${f.file}:${f.line}:${f.name}`}
                interactive
                onClick={() =>
                  window.location.assign(
                    repo.href("findings", `path=${encodeURIComponent(f.file)}&category=complexity`),
                  )
                }
              >
                <Td mono className="max-w-[240px] truncate" title={f.name}>
                  {f.name}
                </Td>
                <Td className="max-w-[320px]">
                  <FilePath path={f.file} line={f.line} />
                </Td>
                <Td
                  numeric
                  className={
                    f.cyclomatic > 30
                      ? "text-critical"
                      : f.cyclomatic > 15
                        ? "text-high"
                        : undefined
                  }
                >
                  {f.cyclomatic}
                </Td>
                <Td
                  numeric
                  className={
                    f.cognitive > 40 ? "text-critical" : f.cognitive > 20 ? "text-high" : undefined
                  }
                >
                  {f.cognitive}
                </Td>
                <Td numeric className="hidden text-fg-secondary sm:table-cell">
                  {f.loc}
                </Td>
                <Td className="hidden md:table-cell">
                  <Bar
                    value={f[sort]}
                    max={maxTop}
                    tone={f[sort] / maxTop > 0.66 ? "high" : "neutral"}
                  />
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Panel>

      <Panel className="mt-6">
        <PanelHeader
          title="Files by total complexity"
          description="sum of cyclomatic complexity per file"
        />
        <Table>
          <THead>
            <tr>
              <Th>File</Th>
              <Th numeric>Functions</Th>
              <Th numeric>Σ cyclomatic</Th>
              <Th className="hidden w-32 md:table-cell" />
            </tr>
          </THead>
          <TBody>
            {c.fileComplexity.slice(0, 20).map((f) => (
              <Tr
                key={f.file}
                interactive
                onClick={() =>
                  window.location.assign(
                    repo.href("findings", `path=${encodeURIComponent(f.file)}`),
                  )
                }
              >
                <Td className="max-w-[420px]">
                  <FilePath path={f.file} />
                </Td>
                <Td numeric className="text-fg-secondary">
                  {f.functions}
                </Td>
                <Td numeric>{f.sumCyclomatic}</Td>
                <Td className="hidden md:table-cell">
                  <Bar value={f.sumCyclomatic} max={maxFile} />
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Panel>
    </>
  );
}
