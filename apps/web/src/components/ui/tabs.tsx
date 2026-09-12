"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type * as React from "react";
import { cn } from "@/lib/utils";

export interface LinkTab {
  href: string;
  label: string;
  /** Match exactly (default) or by prefix. */
  exact?: boolean;
  count?: number;
}

/** Underline tabs driven by the current pathname; the query string is preserved by the caller. */
export function LinkTabs({
  tabs,
  className,
  preserveQuery,
}: {
  tabs: LinkTab[];
  className?: string;
  preserveQuery?: string;
}) {
  const pathname = usePathname();
  return (
    <nav className={cn("-mb-px flex gap-1 overflow-x-auto", className)} aria-label="Sections">
      {tabs.map((t) => {
        const active = t.exact === false ? pathname.startsWith(t.href) : pathname === t.href;
        return (
          <Link
            key={t.href}
            href={preserveQuery ? `${t.href}?${preserveQuery}` : t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-9 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm transition-colors",
              active
                ? "border-accent text-fg"
                : "border-transparent text-fg-muted hover:border-border-strong hover:text-fg",
            )}
          >
            {t.label}
            {t.count !== undefined ? (
              <span className="tabular rounded-sm bg-surface-2 px-1 text-2xs text-fg-subtle">
                {t.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: React.ReactNode }>;
  className?: string;
  "aria-label": string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex h-8 items-center rounded-md border border-border-strong bg-surface p-0.5",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-full rounded-sm px-2.5 text-xs font-medium transition-colors",
            value === o.value ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
