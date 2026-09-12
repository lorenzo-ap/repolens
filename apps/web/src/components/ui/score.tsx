import { gradeForScore } from "@repolens/shared";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type * as React from "react";
import { cn, scoreBand } from "@/lib/utils";

const BAND_TEXT = {
  good: "text-good",
  medium: "text-medium",
  high: "text-high",
  critical: "text-critical",
  none: "text-fg-subtle",
} as const;

const BAND_STROKE = {
  good: "var(--good)",
  medium: "var(--medium)",
  high: "var(--high)",
  critical: "var(--critical)",
  none: "var(--border-strong)",
} as const;

export function ScoreRing({
  score,
  size = 96,
  label = "Health score",
  className,
}: {
  score: number | null;
  size?: number;
  label?: string;
  className?: string;
}) {
  const band = scoreBand(score);
  const stroke = size >= 80 ? 7 : 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const value = score ?? 0;
  const dash = (value / 100) * c;
  return (
    <div
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label}: ${score === null ? "not available" : `${Math.round(value)} of 100, grade ${gradeForScore(value)}`}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <title>{label}</title>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={BAND_STROKE[band]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn(
            "tabular font-semibold leading-none",
            size >= 80 ? "text-2xl" : "text-lg",
            BAND_TEXT[band],
          )}
        >
          {score === null ? "–" : Math.round(value)}
        </span>
        {size >= 80 ? (
          <span className="mt-1 text-2xs uppercase tracking-[0.04em] text-fg-subtle">
            {score === null ? "n/a" : `Grade ${gradeForScore(value)}`}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function ScoreBar({ score, className }: { score: number | null; className?: string }) {
  const band = scoreBand(score);
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}
      aria-hidden
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${score ?? 0}%`, background: BAND_STROKE[band] }}
      />
    </div>
  );
}

export function ScoreText({
  score,
  className,
}: {
  score: number | null | undefined;
  className?: string;
}) {
  const band = scoreBand(score);
  return (
    <span className={cn("tabular font-semibold", BAND_TEXT[band], className)}>
      {score === null || score === undefined ? "–" : Math.round(score)}
    </span>
  );
}

/** Signed change indicator. `higherIsBetter` colours the delta; null keeps it neutral. */
export function Delta({
  value,
  higherIsBetter = true,
  digits = 0,
  suffix = "",
  className,
}: {
  value: number | null | undefined;
  higherIsBetter?: boolean | null;
  digits?: number;
  suffix?: string;
  className?: string;
}) {
  if (value === null || value === undefined || Number.isNaN(value))
    return <span className={cn("text-fg-subtle", className)}>–</span>;
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0)
    return (
      <span className={cn("inline-flex items-center gap-0.5 text-fg-subtle", className)}>
        <Minus className="size-3" /> 0{suffix}
      </span>
    );
  const positive = rounded > 0;
  const good = higherIsBetter === null ? null : higherIsBetter ? positive : !positive;
  const tone = good === null ? "text-fg-muted" : good ? "text-good" : "text-critical";
  return (
    <span className={cn("tabular inline-flex items-center gap-0.5", tone, className)}>
      {positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {positive ? "+" : ""}
      {rounded.toLocaleString("en-US", { maximumFractionDigits: digits })}
      {suffix}
    </span>
  );
}

export function StatTile({
  label,
  value,
  delta,
  hint,
  className,
  children,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  delta?: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-md border border-border bg-surface px-4 py-3", className)}>
      <div className="label-caps">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="tabular text-xl font-semibold leading-7 text-fg">{value}</div>
        {delta ? <div className="text-xs">{delta}</div> : null}
      </div>
      {hint ? <div className="mt-0.5 text-xs text-fg-subtle">{hint}</div> : null}
      {children}
    </div>
  );
}
