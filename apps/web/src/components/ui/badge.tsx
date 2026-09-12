import type { AnalysisStatus, Severity, StepStatus } from "@repolens/shared";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn, SEVERITY_FULL } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xs border px-1.5 text-2xs font-medium leading-4",
  {
    variants: {
      tone: {
        neutral: "border-border bg-bg-muted text-fg-secondary",
        outline: "border-border-strong bg-transparent text-fg-secondary",
        accent: "border-transparent bg-accent-subtle text-accent",
        critical: "border-transparent bg-critical-subtle text-critical",
        high: "border-transparent bg-high-subtle text-high",
        medium: "border-transparent bg-medium-subtle text-medium",
        low: "border-transparent bg-low-subtle text-low",
        info: "border-transparent bg-info-subtle text-info",
        good: "border-transparent bg-good-subtle text-good",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

const SEVERITY_DOT: Record<Severity, string> = {
  critical: "bg-critical",
  high: "bg-high",
  medium: "bg-medium",
  low: "bg-low",
  info: "bg-info",
};

/** A small filled dot; the quietest way to encode severity next to text. */
export function SeverityDot({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", SEVERITY_DOT[severity], className)}
      aria-hidden
    />
  );
}

/** Dot + word. Use in dense lists where a tinted pill would be visual noise. */
export function SeverityLabel({
  severity,
  className,
  short,
}: {
  severity: Severity;
  className?: string;
  short?: boolean;
}) {
  const label = SEVERITY_FULL[severity];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium text-fg-secondary",
        className,
      )}
      title={`Severity: ${label}`}
    >
      <SeverityDot severity={severity} />
      <span className={short ? "sr-only sm:not-sr-only" : undefined}>{label}</span>
    </span>
  );
}

/** Tinted pill; use once per view where severity is the headline (detail panels). */
export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <Badge
      tone={severity}
      className={cn("uppercase tracking-[0.06em]", className)}
      aria-label={`Severity ${SEVERITY_FULL[severity]}`}
    >
      {SEVERITY_FULL[severity]}
    </Badge>
  );
}

const STATUS_TONE: Record<AnalysisStatus, BadgeProps["tone"]> = {
  queued: "outline",
  running: "accent",
  completed: "good",
  failed: "critical",
  cancelled: "neutral",
};

export function StatusBadge({ status, className }: { status: AnalysisStatus; className?: string }) {
  return (
    <Badge tone={STATUS_TONE[status]} className={cn("capitalize", className)}>
      {status === "running" ? (
        <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden />
      ) : null}
      {status}
    </Badge>
  );
}

const STEP_TONE: Record<StepStatus, BadgeProps["tone"]> = {
  pending: "outline",
  running: "accent",
  completed: "good",
  failed: "critical",
  skipped: "neutral",
};

export function StepBadge({ status }: { status: StepStatus }) {
  return (
    <Badge tone={STEP_TONE[status]} className="capitalize">
      {status}
    </Badge>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge
      tone="outline"
      className={cn("uppercase tracking-[0.06em]", className)}
      title="Public demo: a real repository analyzed by the real pipeline. Read-only."
    >
      Demo
    </Badge>
  );
}
