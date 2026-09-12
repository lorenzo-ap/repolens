"use client";

import { Check } from "lucide-react";
import { Checkbox as RCheckbox } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-8 w-full rounded-md border border-border-strong bg-surface px-2.5 text-sm text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-0 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});

export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function NativeSelect({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        "h-8 rounded-md border border-border-strong bg-surface px-2 pr-7 text-sm text-fg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-0 disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  count,
  id,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: React.ReactNode;
  count?: number;
  id?: string;
  className?: string;
}) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  return (
    <label
      htmlFor={inputId}
      className={cn(
        "flex h-7 cursor-pointer items-center gap-2 rounded-sm px-1.5 text-sm text-fg hover:bg-surface-2",
        className,
      )}
    >
      <RCheckbox.Root
        id={inputId}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        className="flex size-4 shrink-0 items-center justify-center rounded-[3px] border border-border-strong bg-surface data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-fg"
      >
        <RCheckbox.Indicator>
          <Check className="size-3" strokeWidth={3} />
        </RCheckbox.Indicator>
      </RCheckbox.Root>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined ? <span className="tabular text-xs text-fg-subtle">{count}</span> : null}
    </label>
  );
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border bg-surface-2 px-1 font-mono text-2xs text-fg-subtle",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
