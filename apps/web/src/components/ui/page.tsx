import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Page header inside the application shell: title, one-line description and actions.
 * Compact by design; the page title is 18px so content starts high on the screen.
 */
export function PageHeader({
  title,
  description,
  actions,
  meta,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-5 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-fg">{title}</h1>
        {description ? (
          <p className="mt-0.5 max-w-2xl text-sm text-fg-secondary">{description}</p>
        ) : null}
        {meta ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-tertiary">
            {meta}
          </div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Two-column content layout: main + narrow aside, stacking on small screens. */
export function SplitLayout({
  children,
  aside,
  asideWidth = "320px",
  className,
}: {
  children: React.ReactNode;
  aside: React.ReactNode;
  asideWidth?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("grid gap-6 lg:grid-cols-[minmax(0,1fr)_var(--aside)]", className)}
      style={{ "--aside": asideWidth } as React.CSSProperties}
    >
      <div className="min-w-0">{children}</div>
      <aside className="min-w-0">{aside}</aside>
    </div>
  );
}
