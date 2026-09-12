"use client";

import type { FindingSummary, Severity } from "@repolens/shared";
import { SEVERITIES } from "@repolens/shared";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SeverityDot } from "@/components/ui/badge";
import { cn, SEVERITY_FULL } from "@/lib/utils";

const SEVERITY_VAR: Record<Severity, string> = {
  critical: "var(--critical)",
  high: "var(--high)",
  medium: "var(--medium)",
  low: "var(--low)",
  info: "var(--info)",
};

/** Severity distribution as labelled proportion rows. */
export function SeverityBars({
  summary,
  onSelect,
  className,
}: {
  summary: FindingSummary | null;
  onSelect?: (s: Severity) => void;
  className?: string;
}) {
  const total = Math.max(1, summary?.total ?? 0);
  return (
    <ul className={cn("space-y-1", className)} aria-label="Findings by severity">
      {SEVERITIES.map((s) => {
        const n = summary?.bySeverity[s] ?? 0;
        const Comp = onSelect ? "button" : "div";
        return (
          <li key={s}>
            <Comp
              type={onSelect ? "button" : undefined}
              onClick={onSelect ? () => onSelect(s) : undefined}
              className={cn(
                "-mx-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-sm px-2 py-1 text-left",
                onSelect && "transition-colors hover:bg-bg-muted",
              )}
              aria-label={`${SEVERITY_FULL[s]}: ${n} findings`}
            >
              <span className="flex w-20 shrink-0 items-center gap-1.5 text-xs text-fg-secondary">
                <SeverityDot severity={s} />
                {SEVERITY_FULL[s]}
              </span>
              <span
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-emphasis"
                aria-hidden
              >
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${(n / total) * 100}%`, background: SEVERITY_VAR[s] }}
                />
              </span>
              <span className="tabular w-8 shrink-0 text-right text-xs text-fg">{n}</span>
            </Comp>
          </li>
        );
      })}
    </ul>
  );
}

export function WeeklyCommitsChart({
  data,
  height = 120,
}: {
  data: Array<{ week: string; commits: number }>;
  height?: number;
}) {
  if (data.length === 0)
    return (
      <p className="py-8 text-center text-sm text-fg-secondary">No commit history available.</p>
    );
  return (
    <figure>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            barCategoryGap={3}
          >
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="week"
              tick={{ fontSize: 10, fill: "var(--fg-tertiary)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tickFormatter={(w: string) => w.slice(5)}
              interval={4}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--fg-tertiary)" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={28}
            />
            <Tooltip
              cursor={{ fill: "var(--bg-muted)" }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as { week: string; commits: number } | undefined;
                if (!active || !p) return null;
                return (
                  <div className="rounded-sm border border-border bg-bg px-2.5 py-1.5 text-xs shadow-md">
                    <div className="font-mono text-fg-tertiary">{p.week}</div>
                    <div className="text-fg">
                      <span className="tabular font-semibold">{p.commits}</span> commits
                    </div>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="commits"
              fill="var(--chart-1)"
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        Commits per week for the last {data.length} weeks.
      </figcaption>
    </figure>
  );
}

/** Labelled horizontal distribution (e.g. complexity buckets). */
export function DistributionBars({
  data,
  label,
  tone = "var(--chart-2)",
}: {
  data: Array<{ bucket: string; count: number }>;
  label: string;
  tone?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = Math.max(
    1,
    data.reduce((a, d) => a + d.count, 0),
  );
  return (
    <ul className="space-y-1" aria-label={label}>
      {data.map((d) => (
        <li key={d.bucket} className="flex items-center gap-3 py-0.5">
          <span className="w-12 shrink-0 font-mono text-xs text-fg-secondary">{d.bucket}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-emphasis" aria-hidden>
            <span
              className="block h-full rounded-full"
              style={{ width: `${(d.count / max) * 100}%`, background: tone }}
            />
          </span>
          <span className="tabular w-14 shrink-0 text-right text-xs text-fg">{d.count}</span>
          <span className="tabular w-10 shrink-0 text-right text-2xs text-fg-tertiary">
            {((d.count / total) * 100).toFixed(0)}%
          </span>
        </li>
      ))}
    </ul>
  );
}
