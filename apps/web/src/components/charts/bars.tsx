"use client";

import type { FindingSummary, Severity } from "@repolens/shared";
import { SEVERITIES } from "@repolens/shared";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SEVERITY_FULL } from "@/lib/utils";

const SEVERITY_VAR: Record<Severity, string> = {
  critical: "var(--critical)",
  high: "var(--high)",
  medium: "var(--medium)",
  low: "var(--low)",
  info: "var(--info)",
};

/** Horizontal severity distribution. Pure CSS so it stays crisp at any width. */
export function SeverityBars({
  summary,
  onSelect,
}: {
  summary: FindingSummary | null;
  onSelect?: (s: Severity) => void;
}) {
  const max = Math.max(1, ...SEVERITIES.map((s) => summary?.bySeverity[s] ?? 0));
  return (
    <ul className="space-y-1.5" aria-label="Findings by severity">
      {SEVERITIES.map((s) => {
        const n = summary?.bySeverity[s] ?? 0;
        const Comp = onSelect ? "button" : "div";
        return (
          <li key={s}>
            <Comp
              type={onSelect ? "button" : undefined}
              onClick={onSelect ? () => onSelect(s) : undefined}
              className="flex w-full items-center gap-3 rounded-sm text-left hover:bg-surface-2"
              aria-label={`${SEVERITY_FULL[s]}: ${n} findings`}
            >
              <span className="w-14 shrink-0 text-xs text-fg-muted">{SEVERITY_FULL[s]}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${(n / max) * 100}%`, background: SEVERITY_VAR[s] }}
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

export function WeeklyCommitsChart({ data }: { data: Array<{ week: string; commits: number }> }) {
  if (data.length === 0)
    return <p className="py-8 text-center text-sm text-fg-muted">No commit history available.</p>;
  return (
    <figure>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="week"
              tick={{ fontSize: 10, fill: "var(--fg-subtle)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tickFormatter={(w: string) => w.slice(5)}
              interval={3}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--fg-subtle)" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as { week: string; commits: number } | undefined;
                if (!active || !p) return null;
                return (
                  <div className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-popover">
                    <div className="font-mono text-fg-subtle">{p.week}</div>
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

export function DistributionBars({
  data,
  label,
}: {
  data: Array<{ bucket: string; count: number }>;
  label: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <ul className="space-y-1.5" aria-label={label}>
      {data.map((d) => (
        <li key={d.bucket} className="flex items-center gap-3">
          <span className="w-12 shrink-0 font-mono text-xs text-fg-muted">{d.bucket}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <span
              className="block h-full rounded-full bg-[var(--chart-2)]"
              style={{ width: `${(d.count / max) * 100}%` }}
            />
          </span>
          <span className="tabular w-10 shrink-0 text-right text-xs text-fg">{d.count}</span>
        </li>
      ))}
    </ul>
  );
}
