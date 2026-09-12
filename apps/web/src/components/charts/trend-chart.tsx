"use client";

import type { AnalysisSummary } from "@repolens/shared";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate, formatDateShort, shortSha } from "@/lib/utils";

interface Point {
  id: string;
  date: string;
  label: string;
  score: number;
  sha: string;
  ref: string | null;
  findings: number;
}

export function toPoints(analyses: AnalysisSummary[]): Point[] {
  return analyses
    .filter((a) => a.status === "completed" && a.healthScore !== null)
    .map((a) => ({
      id: a.id,
      date: a.commitDate ?? a.finishedAt ?? a.createdAt,
      label: formatDate(a.commitDate ?? a.finishedAt ?? a.createdAt),
      score: Math.round((a.healthScore ?? 0) * 10) / 10,
      sha: shortSha(a.commitSha),
      ref: a.branch,
      findings: a.findingSummary?.total ?? 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Health score over time. One series, no decoration; answers "is this getting better?".
 */
export function HealthTrendChart({
  analyses,
  selectedId,
  onSelect,
  height = 160,
}: {
  analyses: AnalysisSummary[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  height?: number;
}) {
  const points = toPoints(analyses);
  if (points.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center text-center" style={{ height }}>
        <p className="text-sm text-fg-secondary">A trend appears after the second analysis.</p>
        {points[0] ? (
          <p className="mt-1 text-xs text-fg-tertiary">
            Current score {points[0].score} at {points[0].sha}
          </p>
        ) : null}
      </div>
    );
  }
  const min = Math.min(...points.map((p) => p.score));
  const floor = Math.max(0, Math.floor((min - 10) / 10) * 10);

  return (
    <figure>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={points}
            margin={{ top: 6, right: 6, bottom: 0, left: 0 }}
            onClick={(state: unknown) => {
              const payload = (state as { activePayload?: Array<{ payload: Point }> } | null)
                ?.activePayload;
              const p = payload?.[0]?.payload;
              if (onSelect && p) onSelect(p.id);
            }}
          >
            <defs>
              <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.14} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--fg-tertiary)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              minTickGap={32}
              tickFormatter={(v: string) => formatDateShort(new Date(v).toISOString())}
            />
            <YAxis
              domain={[floor, 100]}
              tick={{ fontSize: 11, fill: "var(--fg-tertiary)" }}
              tickLine={false}
              axisLine={false}
              width={32}
              tickCount={4}
            />
            <Tooltip
              cursor={{ stroke: "var(--border-strong)" }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as Point | undefined;
                if (!active || !p) return null;
                return (
                  <div className="rounded-sm border border-border bg-bg px-2.5 py-1.5 text-xs shadow-md">
                    <div className="font-mono text-fg-tertiary">
                      {p.sha}
                      {p.ref ? ` · ${p.ref}` : ""}
                    </div>
                    <div className="mt-0.5 text-fg">
                      Score <span className="tabular font-semibold">{p.score}</span> · {p.findings}{" "}
                      findings
                    </div>
                    <div className="text-fg-tertiary">{p.label}</div>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke="var(--chart-1)"
              strokeWidth={1.5}
              fill="url(#trend-fill)"
              isAnimationActive={false}
              dot={(props: { cx?: number; cy?: number; payload?: Point }) => {
                const isSelected = props.payload?.id === selectedId;
                return (
                  <circle
                    key={props.payload?.id}
                    cx={props.cx}
                    cy={props.cy}
                    r={isSelected ? 3.5 : 2.5}
                    fill={isSelected ? "var(--chart-1)" : "var(--bg)"}
                    stroke="var(--chart-1)"
                    strokeWidth={1.5}
                  />
                );
              }}
              activeDot={{ r: 4, stroke: "var(--chart-1)", fill: "var(--chart-1)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        Health score by commit date: {points.map((p) => `${p.label}: ${p.score}`).join("; ")}
      </figcaption>
    </figure>
  );
}
