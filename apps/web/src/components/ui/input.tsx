"use client";

import { Check, ChevronDown } from "lucide-react";
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
        "h-8 w-full rounded-sm border border-border-strong bg-bg px-2.5 text-sm text-fg shadow-sm placeholder:text-fg-tertiary transition-[border-color,box-shadow] focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-subtle)] focus-visible:outline-none disabled:opacity-50",
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
    <span className={cn("relative inline-flex", className)}>
      <select
        ref={ref}
        className="h-8 w-full appearance-none rounded-sm border border-border-strong bg-bg pl-2.5 pr-7 text-sm text-fg shadow-sm transition-[border-color,box-shadow] focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-subtle)] focus-visible:outline-none disabled:opacity-50"
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-fg-tertiary"
        aria-hidden
      />
    </span>
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
        "-mx-1.5 flex h-7 cursor-pointer items-center gap-2 rounded-sm px-1.5 text-sm text-fg-secondary transition-colors hover:bg-bg-muted hover:text-fg",
        checked && "text-fg",
        className,
      )}
    >
      <RCheckbox.Root
        id={inputId}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        className="flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border border-border-strong bg-bg transition-colors data-[state=checked]:border-fg data-[state=checked]:bg-fg data-[state=checked]:text-fg-inverse"
      >
        <RCheckbox.Indicator>
          <Check className="size-2.5" strokeWidth={3} />
        </RCheckbox.Indicator>
      </RCheckbox.Root>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined ? (
        <span className="tabular text-xs text-fg-tertiary">{count}</span>
      ) : null}
    </label>
  );
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[3px] border border-border bg-bg-subtle px-1 font-mono text-[10px] text-fg-tertiary",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** Toggle group for view options (layout, level). Buttons with aria-pressed. */
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
    <fieldset
      aria-label={ariaLabel}
      className={cn(
        "m-0 inline-flex h-8 items-center gap-0.5 rounded-sm border border-border-strong bg-bg p-0.5 shadow-sm",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-full rounded-[3px] px-2.5 text-xs font-medium transition-colors",
            value === o.value ? "bg-bg-emphasis text-fg" : "text-fg-secondary hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}
