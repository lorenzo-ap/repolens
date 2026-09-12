"use client";

import type { AnalysisSummary } from "@repolens/shared";
import { CATEGORY_LABELS } from "@repolens/shared";
import { GitCompareArrows, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { WeeklyCommitsChart } from "@/components/charts/bars";
import { HealthTrendChart } from "@/components/charts/trend-chart";
import { useRepo } from "@/components/repo/context";
import { SeverityBadge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { NativeSelect } from "@/components/ui/input";
import { Delta, ScoreText } from "@/components/ui/score";
import { Table, TBody, Td, THead, Th, Tr } from "@/components/ui/table";
import { useCompare, useHistory } from "@/lib/queries";
import { fmt, formatDateTime, formatDuration, pct, shortSha, truncateMiddle } from "@/lib/utils";

export function HistoryView() {
  const repo = useRepo();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const base = `/r/${repo.owner}/${repo.name}`;
  const completed = useMemo(
    () => repo.analyses.filter((a) => a.status === "completed"),
    [repo.analyses],
  );
  const target = repo.analysis;
  const previous = useMemo(() => {
    if (!target) return null;
    const sorted = [...completed].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const idx = sorted.findIndex((a) => a.id === target.id);
    return idx > 0 ? (sorted[idx - 1] ?? null) : null;
  }, [completed, target]);
  const baseId = sp.get("base") ?? previous?.id ?? null;
  const compare = useCompare(target?.id ?? null, baseId);
  const history = useHistory(target?.id ?? null);

  const setBase = (id: string) => {
    const next = new URLSearchParams(sp.toString());
    if (id) next.set("base", id);
    else next.delete("base");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  if (!target)
    return (
      <EmptyState
        title="No history yet"
        description="Each completed analysis is recorded here so you can compare them."
      />
    );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader
            title="Health over time"
            description={`${completed.length} completed ${completed.length === 1 ? "analysis" : "analyses"}`}
          />
          <CardBody className="pt-2">
            <HealthTrendChart
              analyses={repo.analyses}
              selectedId={target.id}
              onSelect={(id) =>
                router.push(
                  id === repo.latestCompleted?.id
                    ? `${base}/history`
                    : `${base}/history?analysis=${id}`,
                )
              }
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Commit activity"
            description={
              history.data
                ? `${fmt(history.data.commits)} commits analyzed · bus factor ${history.data.busFactor}`
                : "Last 26 weeks"
            }
            action={<Users className="size-4 text-fg-subtle" aria-hidden />}
          />
          <CardBody className="pt-2">
            {history.isPending ? (
              <Skeleton className="h-36" />
            ) : history.isError ? (
              <ErrorState error={history.error} compact />
            ) : (
              <WeeklyCommitsChart data={history.data.commitsPerWeek} />
            )}
            {history.data?.authors.length ? (
              <ul className="mt-3 space-y-1">
                {history.data.authors.slice(0, 5).map((a) => (
                  <li key={a.name} className="flex items-center gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate text-fg">{a.name}</span>
                    <span
                      className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-3"
                      aria-hidden
                    >
                      <span
                        className="block h-full rounded-full bg-[var(--chart-3)]"
                        style={{ width: `${a.share * 100}%` }}
                      />
                    </span>
                    <span className="tabular w-10 text-right text-fg-muted">{pct(a.share)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Compare analyses"
          description="Scores, findings and metrics between two commits"
          action={
            <div className="flex items-center gap-2 text-xs">
              <NativeSelect
                value={baseId ?? ""}
                onChange={(e) => setBase(e.target.value)}
                aria-label="Base analysis"
                className="max-w-[220px]"
              >
                <option value="">Select a base…</option>
                {completed
                  .filter((a) => a.id !== target.id)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {shortSha(a.commitSha)} · {formatDateTime(a.finishedAt ?? a.createdAt)}
                    </option>
                  ))}
              </NativeSelect>
              <GitCompareArrows className="size-4 text-fg-subtle" aria-hidden />
              <span className="font-mono">{shortSha(target.commitSha)}</span>
            </div>
          }
        />
        {!baseId ? (
          <CardBody>
            <p className="text-sm text-fg-muted">
              {completed.length < 2
                ? "Run a second analysis to compare."
                : "Choose a base analysis to compare against the one you are viewing."}
            </p>
          </CardBody>
        ) : compare.isPending ? (
          <CardBody>
            <Skeleton className="h-40" />
          </CardBody>
        ) : compare.isError ? (
          <CardBody>
            <ErrorState error={compare.error} onRetry={() => compare.refetch()} compact />
          </CardBody>
        ) : (
          <CardBody className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              {compare.data.scoreDeltas.map((d) => (
                <div key={d.category} className="min-w-0">
                  <div className="truncate text-2xs uppercase tracking-[0.04em] text-fg-subtle">
                    {d.category === "health" ? "Health" : CATEGORY_LABELS[d.category]}
                  </div>
                  <div className="mt-0.5 flex items-baseline gap-1.5">
                    <ScoreText score={d.after} className="text-lg" />
                    <Delta
                      value={d.before !== null && d.after !== null ? d.after - d.before : null}
                      digits={1}
                      className="text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <FindingList
                title="New findings"
                tone="critical"
                list={compare.data.findings.new}
                base={base}
                analysisId={target.id}
                q={repo.preserveQuery}
              />
              <FindingList
                title="Resolved findings"
                tone="good"
                list={compare.data.findings.resolved}
                base={base}
                analysisId={baseId}
                q={`analysis=${baseId}`}
              />
            </div>
            <p className="text-xs text-fg-subtle">
              {fmt(compare.data.findings.unchangedCount)} findings unchanged (matched by rule, file
              and symbol).
            </p>

            <div className="rounded-md border border-border">
              <Table>
                <THead>
                  <tr>
                    <Th>Metric</Th>
                    <Th numeric>Base</Th>
                    <Th numeric>Target</Th>
                    <Th numeric>Change</Th>
                  </tr>
                </THead>
                <TBody>
                  {compare.data.metricDeltas.map((m) => (
                    <Tr key={m.key}>
                      <Td>{m.label}</Td>
                      <Td numeric mono>
                        {formatMetric(m.before)}
                      </Td>
                      <Td numeric mono>
                        {formatMetric(m.after)}
                      </Td>
                      <Td numeric>
                        <Delta
                          value={m.before !== null && m.after !== null ? m.after - m.before : null}
                          higherIsBetter={m.higherIsBetter}
                          digits={
                            Number.isInteger(m.after ?? 0) && Number.isInteger(m.before ?? 0)
                              ? 0
                              : 2
                          }
                        />
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          </CardBody>
        )}
      </Card>

      <Card>
        <CardHeader title="All analyses" description="Newest first" />
        <Table>
          <THead>
            <tr>
              <Th>When</Th>
              <Th>Commit</Th>
              <Th>Status</Th>
              <Th numeric>Score</Th>
              <Th numeric className="hidden sm:table-cell">
                Findings
              </Th>
              <Th numeric className="hidden md:table-cell">
                Duration
              </Th>
              <Th className="w-24" />
            </tr>
          </THead>
          <TBody>
            {repo.analyses.map((a: AnalysisSummary) => (
              <Tr key={a.id} selected={a.id === target.id}>
                <Td className="text-fg-muted">{formatDateTime(a.finishedAt ?? a.createdAt)}</Td>
                <Td mono>
                  {shortSha(a.commitSha)}
                  {a.branch ? <span className="ml-1.5 text-fg-subtle">{a.branch}</span> : null}
                </Td>
                <Td>
                  <StatusBadge status={a.status} />
                  {a.status === "failed" && a.error ? (
                    <span className="ml-2 text-xs text-fg-subtle" title={a.error}>
                      {truncateMiddle(a.error, 40)}
                    </span>
                  ) : null}
                </Td>
                <Td numeric>
                  <ScoreText score={a.healthScore} />
                </Td>
                <Td numeric className="hidden sm:table-cell">
                  {a.findingSummary ? fmt(a.findingSummary.total) : "–"}
                </Td>
                <Td numeric className="hidden text-fg-muted md:table-cell">
                  {formatDuration(a.durationMs)}
                </Td>
                <Td className="text-right">
                  {a.status === "completed" ? (
                    <Button asChild size="sm" variant="ghost">
                      <Link
                        href={a.id === repo.latestCompleted?.id ? base : `${base}?analysis=${a.id}`}
                      >
                        {a.id === target.id ? "Viewing" : "View"}
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`${base}/analyses/${a.id}`}>Details</Link>
                    </Button>
                  )}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}

function formatMetric(n: number | null): string {
  if (n === null) return "–";
  return Number.isInteger(n) ? fmt(n) : n.toFixed(2);
}

function FindingList({
  title,
  tone,
  list,
  base,
  analysisId,
  q,
}: {
  title: string;
  tone: "critical" | "good";
  list: Array<{
    id: string;
    severity: "critical" | "high" | "medium" | "low" | "info";
    title: string;
    filePath: string | null;
  }>;
  base: string;
  analysisId: string;
  q: string;
}) {
  return (
    <div className="rounded-md border border-border">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span
          className={
            tone === "critical"
              ? "text-sm font-semibold text-critical"
              : "text-sm font-semibold text-good"
          }
        >
          {title}
        </span>
        <span className="tabular text-xs text-fg-muted">{list.length}</span>
      </div>
      {list.length === 0 ? (
        <p className="px-3 py-5 text-center text-xs text-fg-subtle">None</p>
      ) : (
        <ul className="max-h-64 divide-y divide-border overflow-y-auto">
          {list.slice(0, 50).map((f) => (
            <li key={f.id}>
              <Link
                href={`${base}/findings?finding=${f.id}${q ? `&${q}` : ""}${q.includes("analysis=") ? "" : `&analysis=${analysisId}`}`}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-2"
              >
                <SeverityBadge severity={f.severity} />
                <span className="min-w-0 flex-1 truncate text-xs">{f.title}</span>
                {f.filePath ? (
                  <span className="hidden max-w-[160px] truncate font-mono text-2xs text-fg-subtle sm:block">
                    {f.filePath}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
