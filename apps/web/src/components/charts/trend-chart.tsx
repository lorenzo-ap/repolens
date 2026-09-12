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
import { formatDate, shortSha } from "@/lib/utils";

interface Point {
  id: string;
  date: string;
  label: string;
  score: number;
  sha: string;
  ref: string | null;
  findings: number;
}

export function HealthTrendChart({
  analyses,
  selectedId,
  onSelect,
}: {
  analyses: AnalysisSummary[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const points: Point[] = analyses
    .filter((a) => a.status === "completed" && a.healthScore !== null)
    .map((a) => ({
      id: a.id,
      date: a.commitDate ?? a.finishedAt ?? a.createdAt,
      label: formatDate(a.commitDate ?? a.finishedAt ?? a.createdAt),
      ref: a.branch,
      score: Math.round((a.healthScore ?? 0) * 10) / 10,
      sha: shortSha(a.commitSha),
      findings: a.findingSummary?.total ?? 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length < 2) {
    return (
      <div className="flex h-44 flex-col items-center justify-center text-center">
        <p className="text-sm text-fg-muted">A trend appears after the second analysis.</p>
        {points[0] ? (
          <p className="mt-1 text-xs text-fg-subtle">
            Current score {points[0].score} at {points[0].sha}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <figure>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={points}
            margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
            onClick={(state: unknown) => {
              const payload = (state as { activePayload?: Array<{ payload: Point }> } | null)
                ?.activePayload;
              const p = payload?.[0]?.payload;
              if (onSelect && p) onSelect(p.id);
            }}
          >
            <defs>
              <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.16} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--fg-subtle)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              minTickGap={24}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tick={{ fontSize: 11, fill: "var(--fg-subtle)" }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip
              cursor={{ stroke: "var(--border-strong)" }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as Point | undefined;
                if (!active || !p) return null;
                return (
                  <div className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-popover">
                    <div className="font-mono text-fg-subtle">
                      {p.sha}
                      {p.ref ? ` · ${p.ref}` : ""}
                    </div>
                    <div className="mt-0.5 text-fg">
                      Score <span className="tabular font-semibold">{p.score}</span> · {p.findings}{" "}
                      findings
                    </div>
                    <div className="text-fg-subtle">{p.label}</div>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke="var(--accent)"
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
                    r={isSelected ? 4 : 2.5}
                    fill={isSelected ? "var(--accent)" : "var(--surface)"}
                    stroke="var(--accent)"
                    strokeWidth={1.5}
                  />
                );
              }}
              activeDot={{ r: 4, stroke: "var(--accent)", fill: "var(--accent)" }}
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
