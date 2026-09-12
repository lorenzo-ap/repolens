import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Compact label/value rows. The default building block for numbers in RepoLens: a list of
 * these reads faster than a grid of stat cards and takes a third of the space.
 */
export function MetricList({
  className,
  children,
  columns = 1,
}: {
  className?: string;
  children: React.ReactNode;
  columns?: 1 | 2 | 3;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-8",
        columns === 1 && "grid-cols-1",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {children}
    </dl>
  );
}

export function MetricRow({
  label,
  value,
  hint,
  tone,
  trailing,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "good" | "warn" | "bad" | "muted";
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-baseline justify-between gap-4 border-b border-border py-2 last:border-b-0",
        className,
      )}
    >
      <dt className="min-w-0 truncate text-sm text-fg-secondary">
        {label}
        {hint ? <span className="ml-1.5 text-xs text-fg-tertiary">{hint}</span> : null}
      </dt>
      <dd
        className={cn(
          "tabular flex shrink-0 items-baseline gap-2 text-sm font-medium text-fg",
          tone === "good" && "text-good",
          tone === "warn" && "text-medium",
          tone === "bad" && "text-critical",
          tone === "muted" && "text-fg-tertiary",
        )}
      >
        {value}
        {trailing}
      </dd>
    </div>
  );
}

/** Large figure with a label; for the two or three numbers a page leads with. */
export function Figure({
  label,
  value,
  unit,
  trailing,
  hint,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: React.ReactNode;
  trailing?: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="eyebrow">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="tabular text-2xl font-semibold leading-none text-fg">{value}</span>
        {unit ? <span className="text-xs text-fg-tertiary">{unit}</span> : null}
        {trailing ? <span className="ml-1 text-xs">{trailing}</span> : null}
      </div>
      {hint ? <div className="mt-1 text-xs text-fg-tertiary">{hint}</div> : null}
    </div>
  );
}

/** Horizontal proportion bar used inside rows and tables. */
export function Bar({
  value,
  max = 100,
  tone = "neutral",
  className,
}: {
  value: number;
  max?: number;
  tone?: "neutral" | "accent" | "good" | "medium" | "high" | "critical";
  className?: string;
}) {
  const width = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const fill = {
    neutral: "bg-fg-tertiary",
    accent: "bg-accent",
    good: "bg-good",
    medium: "bg-medium",
    high: "bg-high",
    critical: "bg-critical",
  }[tone];
  return (
    <span
      className={cn("block h-1.5 w-full overflow-hidden rounded-full bg-bg-emphasis", className)}
      aria-hidden
    >
      <span className={cn("block h-full rounded-full", fill)} style={{ width: `${width}%` }} />
    </span>
  );
}
