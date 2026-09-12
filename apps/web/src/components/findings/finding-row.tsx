"use client";

import type { Finding } from "@repolens/shared";
import { CATEGORY_LABELS } from "@repolens/shared";
import Link from "next/link";
import { SeverityDot } from "@/components/ui/badge";
import { FilePath } from "@/components/ui/code";
import { cn, SEVERITY_FULL } from "@/lib/utils";

/**
 * One finding as an issue-list row: severity, title, location. Dense, scannable, keyboard
 * focusable. Used on the dashboard and in the findings list.
 */
export function FindingRow({
  finding: f,
  href,
  onClick,
  selected,
  focused,
  id,
  showCategory = true,
  className,
}: {
  finding: Finding;
  href?: string;
  onClick?: () => void;
  selected?: boolean;
  focused?: boolean;
  id?: string;
  showCategory?: boolean;
  className?: string;
}) {
  const metric = primaryMetric(f);
  const inner = (
    <>
      <span className="mt-[7px] shrink-0" title={SEVERITY_FULL[f.severity]}>
        <SeverityDot severity={f.severity} />
        <span className="sr-only">{SEVERITY_FULL[f.severity]}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-fg">{f.title}</span>
        <span className="mt-0.5 flex items-center gap-2 text-xs text-fg-tertiary">
          {f.filePath ? (
            <FilePath path={f.filePath} line={f.line} className="min-w-0" />
          ) : (
            <span className="font-mono">{f.ruleId}</span>
          )}
        </span>
      </span>
      <span className="ml-3 hidden shrink-0 items-center gap-3 text-xs text-fg-tertiary sm:flex">
        {metric ? <span className="tabular">{metric}</span> : null}
        {showCategory ? (
          <span className="w-24 truncate text-right">{CATEGORY_LABELS[f.category]}</span>
        ) : null}
        <span className={cn("w-14 text-right font-medium", severityText(f.severity))}>
          {SEVERITY_FULL[f.severity]}
        </span>
      </span>
    </>
  );
  const classes = cn(
    "flex w-full items-start gap-3 px-4 py-2 text-left transition-colors hover:bg-bg-muted focus-visible:bg-bg-muted focus-visible:outline-none",
    selected && "bg-accent-subtle/60 hover:bg-accent-subtle/60",
    focused && "shadow-[inset_2px_0_0_var(--fg)]",
    className,
  );
  if (href) {
    return (
      <Link id={id} href={href} className={classes} aria-current={selected ? "true" : undefined}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" id={id} onClick={onClick} className={classes} aria-pressed={selected}>
      {inner}
    </button>
  );
}

function severityText(s: Finding["severity"]): string {
  return {
    critical: "text-critical",
    high: "text-high",
    medium: "text-medium",
    low: "text-low",
    info: "text-info",
  }[s];
}

/** A single number worth showing inline for this finding, when the evidence carries one. */
function primaryMetric(f: Finding): string | null {
  const d = f.evidence.data;
  if (!d) return null;
  if (typeof d.cyclomatic === "number") return `CC ${d.cyclomatic}`;
  if (typeof d.lines === "number") return `${d.lines} lines`;
  if (typeof d.count === "number") return `×${d.count}`;
  if (typeof d.occurrences === "number") return `×${d.occurrences}`;
  if (typeof d.length === "number") return `${d.length} files`;
  if (typeof d.fanIn === "number") return `fan-in ${d.fanIn}`;
  if (typeof d.fanOut === "number") return `fan-out ${d.fanOut}`;
  if (typeof d.commits === "number") return `${d.commits} commits`;
  if (typeof d.depth === "number") return `depth ${d.depth}`;
  if (typeof d.parameters === "number") return `${d.parameters} params`;
  return null;
}
