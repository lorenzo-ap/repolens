import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Tables are the default for tabular data. Hairline rows, a quiet header, monospace for
 * identifiers and numbers. Always horizontally scrollable so the page never overflows.
 */
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="scrollbar-thin w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-bg-subtle text-left", className)} {...props} />;
}

export function TBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function Th({
  className,
  numeric,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "eyebrow h-8 whitespace-nowrap border-b border-border px-3 font-medium",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

export function Tr({
  className,
  interactive,
  selected,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean; selected?: boolean }) {
  return (
    <tr
      className={cn(
        "border-b border-border last:border-b-0",
        interactive &&
          "cursor-pointer transition-colors hover:bg-bg-muted focus-visible:bg-bg-muted focus-visible:outline-none",
        selected && "bg-accent-subtle/70 hover:bg-accent-subtle/70",
        className,
      )}
      {...props}
    />
  );
}

export function Td({
  className,
  numeric,
  mono,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean; mono?: boolean }) {
  return (
    <td
      className={cn(
        "h-9 px-3 align-middle text-fg",
        numeric && "tabular text-right",
        mono && "font-mono text-xs",
        className,
      )}
      {...props}
    />
  );
}
