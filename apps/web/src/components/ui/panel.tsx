import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A bordered region for a group of related content. Used sparingly: most page content sits on
 * the page itself, separated by section headers and hairlines. Panels are for tables, lists and
 * charts that need a visible boundary.
 */
export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={cn("min-w-0 overflow-hidden rounded-md border border-border bg-bg", className)}
      {...props}
    />
  );
}

export function PanelHeader({
  title,
  description,
  action,
  className,
  as: Tag = "h2",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  as?: "h2" | "h3";
}) {
  return (
    <header
      className={cn(
        "flex min-h-10 items-center justify-between gap-3 border-b border-border px-4 py-2",
        className,
      )}
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <Tag className="truncate text-sm font-semibold text-fg">{title}</Tag>
        {description ? (
          <p className="hidden truncate text-xs text-fg-tertiary sm:block">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  );
}

export function PanelBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

export function PanelFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <footer
      className={cn(
        "flex items-center justify-between gap-3 border-t border-border bg-bg-subtle px-4 py-2 text-xs text-fg-tertiary",
        className,
      )}
      {...props}
    />
  );
}

/** Section title on the page surface (no border), for grouping panels and lists. */
export function SectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-fg-tertiary">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
