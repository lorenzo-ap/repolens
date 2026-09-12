"use client";

import { X } from "lucide-react";
import {
  Dialog as RDialog,
  DropdownMenu as RDropdown,
  Popover as RPopover,
  Tooltip as RTooltip,
} from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <RTooltip.Provider delayDuration={250}>{children}</RTooltip.Provider>;
}

export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  if (!content) return <>{children}</>;
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={6}
          className="anim-fade z-50 max-w-xs rounded-sm bg-fg px-2 py-1 text-xs text-fg-inverse shadow-md"
        >
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

// ---------------------------------------------------------------------------
// Dialog & Sheet
// ---------------------------------------------------------------------------

export const Dialog = RDialog.Root;
export const DialogTrigger = RDialog.Trigger;
export const DialogClose = RDialog.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  size = "md",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const width = size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-lg";
  return (
    <RDialog.Portal>
      <RDialog.Overlay className="anim-fade fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px]" />
      <RDialog.Content
        className={cn(
          "anim-rise fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-bg p-5 shadow-lg focus:outline-none",
          width,
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <RDialog.Title className="text-base font-semibold text-fg">{title}</RDialog.Title>
            {description ? (
              <RDialog.Description className="mt-1 text-sm text-fg-secondary">
                {description}
              </RDialog.Description>
            ) : null}
          </div>
          <RDialog.Close
            className="-mr-1 -mt-1 rounded-sm p-1 text-fg-tertiary hover:bg-bg-muted hover:text-fg"
            aria-label="Close"
          >
            <X className="size-4" />
          </RDialog.Close>
        </div>
        {children ? <div className="mt-4">{children}</div> : null}
      </RDialog.Content>
    </RDialog.Portal>
  );
}

/** Right-hand side panel for detail views; wide enough to read code. */
export function SheetContent({
  title,
  description,
  children,
  className,
  header,
  width = "max-w-[640px]",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  /** Optional custom header content rendered next to the close button. */
  header?: React.ReactNode;
  width?: string;
}) {
  return (
    <RDialog.Portal>
      <RDialog.Overlay className="anim-fade fixed inset-0 z-50 bg-black/25" />
      <RDialog.Content
        className={cn(
          "anim-slide fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-bg shadow-lg focus:outline-none",
          width,
          className,
        )}
      >
        <div className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-border px-5">
          <div className="flex min-w-0 items-baseline gap-2">
            <RDialog.Title className="truncate text-sm font-semibold text-fg">
              {title}
            </RDialog.Title>
            {description ? (
              <RDialog.Description className="truncate text-xs text-fg-tertiary">
                {description}
              </RDialog.Description>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {header}
            <RDialog.Close
              className="rounded-sm p-1 text-fg-tertiary hover:bg-bg-muted hover:text-fg"
              aria-label="Close"
            >
              <X className="size-4" />
            </RDialog.Close>
          </div>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">{children}</div>
      </RDialog.Content>
    </RDialog.Portal>
  );
}

// ---------------------------------------------------------------------------
// Dropdown menu
// ---------------------------------------------------------------------------

export const DropdownMenu = RDropdown.Root;
export const DropdownMenuTrigger = RDropdown.Trigger;

export function DropdownMenuContent({
  children,
  align = "end",
  className,
}: {
  children: React.ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  return (
    <RDropdown.Portal>
      <RDropdown.Content
        align={align}
        sideOffset={6}
        className={cn(
          "anim-rise z-50 min-w-44 rounded-md border border-border bg-bg p-1 shadow-md",
          className,
        )}
      >
        {children}
      </RDropdown.Content>
    </RDropdown.Portal>
  );
}

export function DropdownMenuItem({
  className,
  destructive,
  ...props
}: RDropdown.DropdownMenuItemProps & { destructive?: boolean }) {
  return (
    <RDropdown.Item
      className={cn(
        "flex h-8 cursor-pointer select-none items-center gap-2 rounded-sm px-2 text-sm text-fg outline-none data-[highlighted]:bg-bg-muted [&_svg]:size-3.5 [&_svg]:text-fg-tertiary",
        destructive && "text-critical data-[highlighted]:bg-critical-subtle [&_svg]:text-critical",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator() {
  return <RDropdown.Separator className="my-1 h-px bg-border" />;
}

export function DropdownMenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="eyebrow px-2 py-1.5">{children}</div>;
}

// ---------------------------------------------------------------------------
// Popover
// ---------------------------------------------------------------------------

export const Popover = RPopover.Root;
export const PopoverTrigger = RPopover.Trigger;

export function PopoverContent({
  children,
  className,
  align = "start",
}: {
  children: React.ReactNode;
  className?: string;
  align?: "start" | "end" | "center";
}) {
  return (
    <RPopover.Portal>
      <RPopover.Content
        align={align}
        sideOffset={6}
        className={cn(
          "anim-rise z-50 w-72 rounded-md border border-border bg-bg p-3 shadow-md",
          className,
        )}
      >
        {children}
      </RPopover.Content>
    </RPopover.Portal>
  );
}
