"use client";

import type { AnalysisSummary, Category } from "@repolens/shared";
import { CATEGORY_LABELS } from "@repolens/shared";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { HealthTrendChart } from "@/components/charts/trend-chart";
import { FindingRow } from "@/components/findings/finding-row";
import { useRepo } from "@/components/repo/context";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { NativeSelect } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Delta, ScoreText } from "@/components/ui/score";
import { Table, TBody, Td, THead, Th, Tr } from "@/components/ui/table";
import { useCompare } from "@/lib/queries";
import { useUrlParams } from "@/lib/use-url-params";
import {
  cn,
  fmt,
  formatDate,
  formatDateTime,
  formatDuration,
  shortSha,
  truncateMiddle,
} from "@/lib/utils";

export function AnalysesView() {
  const repo = useRepo();
  const sp = useSearchParams();
  const router = useRouter();
  const { update } = useUrlParams();
  const completed = useMemo(
    () =>
      repo.analyses
        .filter((a) => a.status === "completed")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [repo.analyses],
  );
  const target = repo.analysis;
  const baseId = sp.get("base") ?? repo.previous?.id ?? null;
  const compare = useCompare(target?.id ?? null, baseId);

  if (!target) {
    return (
      <>
        <PageHeader title="Analyses" />
        <EmptyState
          title="No completed analysis yet"
          description="Each completed analysis is recorded here so you can compare them."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Analyses"
        description={`${completed.length} completed ${completed.length === 1 ? "analysis" : "analyses"} of ${repo.repository.fullName}`}
      />

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          <PanelHeader title="Health over time" description="by commit date" />
          <div className="px-4 pb-3 pt-3">
            <HealthTrendChart
              analyses={repo.analyses}
              selectedId={target.id}
              height={180}
              onSelect={(id) =>
                router.push(
                  id === repo.latestCompleted?.id
                    ? `${repo.base}/analyses`
                    : `${repo.base}/analyses?analysis=${id}`,
                )
              }
            />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Compare" description="target vs base" />
          <div className="space-y-3 px-4 py-3 text-sm">
            <div>
              <div className="eyebrow mb-1">Target</div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs">
                  {shortSha(target.commitSha)}
                  {target.branch ? (
                    <span className="text-fg-tertiary"> {target.branch}</span>
                  ) : null}
                </span>
                <span className="text-xs text-fg-tertiary">
                  {formatDate(target.commitDate ?? target.createdAt)}
                </span>
              </div>
            </div>
            <div>
              <label htmlFor="base-select" className="eyebrow mb-1 block">
                Base
              </label>
              <NativeSelect
                id="base-select"
                value={baseId ?? ""}
                onChange={(e) => update({ base: e.target.value || null })}
                className="w-full"
              >
                <option value="">Select a base…</option>
                {completed
                  .filter((a) => a.id !== target.id)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {shortSha(a.commitSha)}
                      {a.branch ? ` (${a.branch})` : ""} · {formatDate(a.commitDate ?? a.createdAt)}
                    </option>
                  ))}
              </NativeSelect>
            </div>
            {compare.data ? (
              <ul className="hairlines rounded-md border border-border">
                <Row
                  label="Health"
                  before={compare.data.base.healthScore}
                  after={compare.data.target.healthScore}
                />
                <Row
                  label="Findings"
                  before={compare.data.base.findingSummary?.total ?? null}
                  after={compare.data.target.findingSummary?.total ?? null}
                  higherIsBetter={false}
                />
                <Row label="New" after={compare.data.findings.new.length} tone="bad" />
                <Row label="Resolved" after={compare.data.findings.resolved.length} tone="good" />
                <Row label="Unchanged" after={compare.data.findings.unchangedCount} />
              </ul>
            ) : null}
          </div>
        </Panel>
      </section>

      {baseId ? (
        compare.isPending ? (
          <Skeleton className="mt-6 h-64" />
        ) : compare.isError ? (
          <ErrorState className="mt-6" error={compare.error} onRetry={() => compare.refetch()} />
        ) : (
          <>
            <section className="mt-6">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold">Category changes</h2>
                <span className="text-xs text-fg-tertiary">
                  {shortSha(compare.data.base.commitSha)} →{" "}
                  {shortSha(compare.data.target.commitSha)}
                </span>
              </div>
              <div className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
                {compare.data.scoreDeltas.map((d) => {
                  const diff = d.before !== null && d.after !== null ? d.after - d.before : null;
                  const verdict =
                    diff === null
                      ? "–"
                      : Math.abs(diff) < 0.5
                        ? "Unchanged"
                        : diff > 0
                          ? "Improved"
                          : "Regressed";
                  return (
                    <div key={d.category} className="bg-bg px-4 py-3">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-fg-secondary">
                          {d.category === "health"
                            ? "Health"
                            : CATEGORY_LABELS[d.category as Category]}
                        </span>
                        <span
                          className={cn(
                            "text-2xs font-medium uppercase tracking-[0.06em]",
                            verdict === "Improved"
                              ? "text-good"
                              : verdict === "Regressed"
                                ? "text-critical"
                                : "text-fg-tertiary",
                          )}
                        >
                          {verdict}
                        </span>
                      </div>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="tabular text-xs text-fg-tertiary">
                          {d.before === null ? "–" : Math.round(d.before)}
                        </span>
                        <ArrowRight className="size-3 text-fg-tertiary" aria-hidden />
                        <ScoreText score={d.after} className="text-lg" />
                        <Delta value={diff} digits={1} className="text-xs" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mt-6 grid gap-6 lg:grid-cols-2">
              <Panel>
                <PanelHeader
                  title="New findings"
                  description={`${compare.data.findings.new.length} not present in base`}
                />
                {compare.data.findings.new.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-fg-secondary">None.</p>
                ) : (
                  <div className="hairlines max-h-[420px] overflow-y-auto">
                    {compare.data.findings.new.slice(0, 50).map((f) => (
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
                  title="Resolved findings"
                  description={`${compare.data.findings.resolved.length} no longer present`}
                />
                {compare.data.findings.resolved.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-fg-secondary">None.</p>
                ) : (
                  <div className="hairlines max-h-[420px] overflow-y-auto">
                    {compare.data.findings.resolved.slice(0, 50).map((f) => (
                      <FindingRow
                        key={f.id}
                        finding={f}
                        href={`${repo.base}/findings?analysis=${baseId}&finding=${f.id}`}
                        showCategory={false}
                      />
                    ))}
                  </div>
                )}
              </Panel>
            </section>

            <Panel className="mt-6">
              <PanelHeader title="Metric changes" />
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
                      <Td className="h-8">{m.label}</Td>
                      <Td numeric mono className="h-8 text-fg-secondary">
                        {formatMetric(m.before)}
                      </Td>
                      <Td numeric mono className="h-8">
                        {formatMetric(m.after)}
                      </Td>
                      <Td numeric className="h-8">
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
            </Panel>
          </>
        )
      ) : (
        <p className="mt-6 text-sm text-fg-secondary">
          {completed.length < 2
            ? "Run a second analysis to compare."
            : "Choose a base analysis to compare against the one you are viewing."}
        </p>
      )}

      <Panel className="mt-6">
        <PanelHeader title="All analyses" description="newest first" />
        <Table>
          <THead>
            <tr>
              <Th>Commit</Th>
              <Th className="hidden md:table-cell">Requested</Th>
              <Th>Status</Th>
              <Th numeric>Score</Th>
              <Th numeric className="hidden sm:table-cell">
                Change
              </Th>
              <Th numeric className="hidden sm:table-cell">
                Findings
              </Th>
              <Th numeric className="hidden md:table-cell">
                Duration
              </Th>
              <Th className="w-20" />
            </tr>
          </THead>
          <TBody>
            {repo.analyses.map((a: AnalysisSummary) => {
              const idx = completed.findIndex((c) => c.id === a.id);
              const prev = idx > 0 ? completed[idx - 1] : null;
              const change =
                prev && a.healthScore !== null && prev.healthScore !== null
                  ? a.healthScore - prev.healthScore
                  : null;
              return (
                <Tr key={a.id} selected={a.id === target.id}>
                  <Td>
                    <span className="flex flex-col">
                      <span className="font-mono text-xs">
                        {shortSha(a.commitSha)}
                        {a.branch ? (
                          <span className="ml-1.5 text-fg-tertiary">{a.branch}</span>
                        ) : null}
                      </span>
                      <span className="text-2xs text-fg-tertiary">
                        {formatDate(a.commitDate ?? a.createdAt)}
                      </span>
                    </span>
                  </Td>
                  <Td className="hidden text-fg-secondary md:table-cell">
                    {formatDateTime(a.createdAt)}
                  </Td>
                  <Td>
                    <StatusBadge status={a.status} />
                    {a.status === "failed" && a.error ? (
                      <span className="ml-2 text-xs text-fg-tertiary" title={a.error}>
                        {truncateMiddle(a.error, 40)}
                      </span>
                    ) : null}
                  </Td>
                  <Td numeric>
                    <ScoreText score={a.healthScore} />
                  </Td>
                  <Td numeric className="hidden sm:table-cell">
                    <Delta value={change} digits={1} />
                  </Td>
                  <Td numeric className="hidden sm:table-cell">
                    {a.findingSummary ? fmt(a.findingSummary.total) : "–"}
                  </Td>
                  <Td numeric className="hidden text-fg-secondary md:table-cell">
                    {formatDuration(a.durationMs)}
                  </Td>
                  <Td className="text-right">
                    {a.status === "completed" ? (
                      <Button asChild size="xs" variant="ghost">
                        <Link
                          href={
                            a.id === repo.latestCompleted?.id
                              ? repo.base
                              : `${repo.base}?analysis=${a.id}`
                          }
                        >
                          {a.id === target.id ? "Viewing" : "View"}
                        </Link>
                      </Button>
                    ) : (
                      <Button asChild size="xs" variant="ghost">
                        <Link href={`${repo.base}/analyses/${a.id}`}>Details</Link>
                      </Button>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </Panel>
    </>
  );
}

function Row({
  label,
  before,
  after,
  higherIsBetter = true,
  tone,
}: {
  label: string;
  before?: number | null;
  after: number | null;
  higherIsBetter?: boolean;
  tone?: "good" | "bad";
}) {
  return (
    <li className="flex items-center justify-between px-3 py-1.5 text-xs">
      <span className="text-fg-secondary">{label}</span>
      <span className="flex items-center gap-2">
        {before !== undefined ? (
          <>
            <span className="tabular text-fg-tertiary">
              {before === null ? "–" : Math.round(before)}
            </span>
            <ArrowRight className="size-3 text-fg-tertiary" aria-hidden />
          </>
        ) : null}
        <span
          className={cn(
            "tabular font-medium",
            tone === "good" && after
              ? "text-good"
              : tone === "bad" && after
                ? "text-critical"
                : "text-fg",
          )}
        >
          {after === null ? "–" : Math.round(after)}
        </span>
        {before !== undefined ? (
          <Delta
            value={before !== null && after !== null ? after - before : null}
            higherIsBetter={higherIsBetter}
            digits={1}
          />
        ) : null}
      </span>
    </li>
  );
}

function formatMetric(n: number | null): string {
  if (n === null) return "–";
  return Number.isInteger(n) ? fmt(n) : n.toFixed(2);
}
