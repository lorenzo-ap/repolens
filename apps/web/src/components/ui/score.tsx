import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type * as React from "react";
import { cn, scoreBand, scoreStatus } from "@/lib/utils";

const BAND_TEXT = {
  good: "text-good",
  medium: "text-medium",
  high: "text-high",
  critical: "text-critical",
  none: "text-fg-tertiary",
} as const;

const BAND_BAR = {
  good: "bg-good",
  medium: "bg-medium",
  high: "bg-high",
  critical: "bg-critical",
  none: "bg-border-strong",
} as const;

/** Score number with band colour. Small and inline by default. */
export function ScoreText({
  score,
  className,
}: {
  score: number | null | undefined;
  className?: string;
}) {
  const band = scoreBand(score);
  return (
    <span className={cn("tabular font-medium", BAND_TEXT[band], className)}>
      {score === null || score === undefined ? "–" : Math.round(score)}
    </span>
  );
}

/** Thin proportional bar under a score. */
export function ScoreBar({
  score,
  className,
  height = "h-1",
}: {
  score: number | null;
  className?: string;
  height?: string;
}) {
  const band = scoreBand(score);
  return (
    <span
      className={cn("block w-full overflow-hidden rounded-full bg-bg-emphasis", height, className)}
      aria-hidden
    >
      <span
        className={cn("block h-full rounded-full transition-[width] duration-300", BAND_BAR[band])}
        style={{ width: `${Math.round(score ?? 0)}%` }}
      />
    </span>
  );
}

/**
 * The headline health score: a large number, its qualitative status and a compact bar.
 * Deliberately not a gauge; the number and the word carry the meaning.
 */
export function HealthScore({
  score,
  delta,
  label = "Health score",
  className,
  size = "lg",
}: {
  score: number | null;
  delta?: number | null;
  label?: string;
  className?: string;
  size?: "md" | "lg";
}) {
  const band = scoreBand(score);
  const status = scoreStatus(score);
  const rounded = score === null ? null : Math.round(score);
  return (
    <div
      className={cn("min-w-0", className)}
      role="img"
      aria-label={`${label}: ${rounded === null ? "not available" : `${rounded} of 100, ${status}`}`}
    >
      <div className="eyebrow">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span
          className={cn(
            "tabular font-semibold leading-none tracking-[-0.02em] text-fg",
            size === "lg" ? "text-4xl" : "text-3xl",
          )}
        >
          {rounded ?? "–"}
        </span>
        <span className="text-sm text-fg-tertiary">/ 100</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className={cn("text-sm font-medium", BAND_TEXT[band])}>{status}</span>
        {delta !== undefined ? (
          <Delta value={delta} digits={1} className="text-xs" suffix=" vs previous" />
        ) : null}
      </div>
      <ScoreBar score={score} className="mt-3 max-w-[220px]" height="h-1.5" />
    </div>
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
    return <span className={cn("text-fg-tertiary", className)}>–</span>;
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0)
    return (
      <span className={cn("inline-flex items-center gap-0.5 text-fg-tertiary", className)}>
        <Minus className="size-3" aria-hidden /> 0{suffix}
      </span>
    );
  const positive = rounded > 0;
  const good = higherIsBetter === null ? null : higherIsBetter ? positive : !positive;
  const tone = good === null ? "text-fg-secondary" : good ? "text-good" : "text-critical";
  return (
    <span className={cn("tabular inline-flex items-center gap-0.5", tone, className)}>
      {positive ? (
        <ArrowUpRight className="size-3" aria-hidden />
      ) : (
        <ArrowDownRight className="size-3" aria-hidden />
      )}
      {positive ? "+" : ""}
      {rounded.toLocaleString("en-US", { maximumFractionDigits: digits })}
      {suffix}
    </span>
  );
}

/** Tiny inline trend line for a list of values, e.g. score history in a table row. */
export function Sparkline({
  values,
  width = 96,
  height = 22,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const pts = values.map(
    (v, i) =>
      `${(i * step).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`,
  );
  const last = values[values.length - 1] ?? 0;
  const first = values[0] ?? 0;
  const stroke = last >= first ? "var(--good)" : "var(--critical)";
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={(values.length - 1) * step}
        cy={height - 2 - ((last - min) / span) * (height - 4)}
        r={2}
        fill={stroke}
      />
    </svg>
  );
}

export function ScoreRow({
  label,
  score,
  delta,
  href,
  description,
}: {
  label: React.ReactNode;
  score: number | null;
  delta?: number | null;
  href?: string;
  description?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm text-fg">{label}</span>
        <span className="flex items-center gap-3">
          {delta !== undefined ? <Delta value={delta} className="text-xs" /> : null}
          <ScoreText score={score} className="w-7 text-right text-sm" />
        </span>
      </div>
      <ScoreBar score={score} className="mt-1.5" />
      {description ? <p className="mt-1 text-xs text-fg-tertiary">{description}</p> : null}
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        className="-mx-2 block rounded-sm px-2 py-2 transition-colors hover:bg-bg-muted focus-visible:outline-2 focus-visible:outline-ring"
      >
        {inner}
      </a>
    );
  }
  return <div className="py-2">{inner}</div>;
}
