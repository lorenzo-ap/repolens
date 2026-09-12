import type { AnalysisStatus, Severity, StepStatus } from "@repolens/shared";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn, SEVERITY_FULL, SEVERITY_LABEL } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-5 items-center gap-1 rounded-sm border px-1.5 text-2xs font-medium leading-4 whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-border bg-surface-2 text-fg-muted",
        accent: "border-transparent bg-accent-bg text-accent",
        critical: "border-transparent bg-critical-bg text-critical",
        high: "border-transparent bg-high-bg text-high",
        medium: "border-transparent bg-medium-bg text-medium",
        low: "border-transparent bg-low-bg text-low",
        info: "border-transparent bg-info-bg text-info",
        good: "border-transparent bg-good-bg text-good",
        outline: "border-border-strong bg-transparent text-fg-muted",
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

export function SeverityBadge({
  severity,
  full = false,
  className,
}: {
  severity: Severity;
  full?: boolean;
  className?: string;
}) {
  return (
    <Badge
      tone={severity}
      className={cn("uppercase tracking-[0.04em]", className)}
      aria-label={`Severity ${SEVERITY_FULL[severity]}`}
    >
      {full ? SEVERITY_FULL[severity] : SEVERITY_LABEL[severity]}
    </Badge>
  );
}

const STATUS_TONE: Record<AnalysisStatus, BadgeProps["tone"]> = {
  queued: "neutral",
  running: "accent",
  completed: "good",
  failed: "critical",
  cancelled: "outline",
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
      tone="accent"
      className={cn("uppercase tracking-[0.04em]", className)}
      title="This repository was analyzed by the real pipeline and is shown as a public demo"
    >
      Demo data
    </Badge>
  );
}
