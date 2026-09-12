import type * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="scrollbar-thin w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("sticky top-0 z-10 bg-surface-2 text-left", className)} {...props} />;
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
        "h-8 whitespace-nowrap border-b border-border px-3 text-2xs font-medium uppercase tracking-[0.04em] text-fg-subtle",
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
          "cursor-pointer hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none",
        selected && "bg-accent-bg/60 hover:bg-accent-bg/60",
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
