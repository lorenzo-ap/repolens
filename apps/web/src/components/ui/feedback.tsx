"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import type * as React from "react";
import { ApiClientError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton", className)} aria-hidden {...props} />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={`sk-${i.toString()}`}
          className="h-3"
          style={{ width: `${100 - (i % 3) * 18}%` }}
        />
      ))}
    </div>
  );
}

/** Skeleton shaped like a list of rows, for tables and issue lists. */
export function SkeletonRows({ rows = 8, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("hairlines", className)} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={`row-${i.toString()}`} className="flex items-center gap-3 px-4 py-2.5">
          <Skeleton className="size-2 rounded-full" />
          <Skeleton className="h-3" style={{ width: `${44 - (i % 4) * 7}%` }} />
          <Skeleton className="ml-auto h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-md border border-dashed border-border-strong text-center",
        compact ? "px-4 py-8" : "px-6 py-14",
        className,
      )}
    >
      {Icon ? (
        <div className="mb-3 flex size-8 items-center justify-center rounded-sm border border-border bg-bg-subtle text-fg-tertiary">
          <Icon className="size-4" />
        </div>
      ) : null}
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-fg-secondary">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function describeError(error: unknown): {
  title: string;
  message: string;
  requestId?: string;
} {
  if (error instanceof ApiClientError) {
    if (error.code === "network")
      return {
        title: "Cannot reach RepoLens",
        message: "The API did not respond. Check your connection and try again.",
      };
    if (error.code === "unauthorized")
      return { title: "Sign-in required", message: error.message, requestId: error.requestId };
    if (error.code === "not_found")
      return { title: "Not found", message: error.message, requestId: error.requestId };
    if (error.code === "rate_limited")
      return { title: "Slow down", message: error.message, requestId: error.requestId };
    if (error.code === "github_error")
      return { title: "GitHub error", message: error.message, requestId: error.requestId };
    return { title: "Something went wrong", message: error.message, requestId: error.requestId };
  }
  return {
    title: "Something went wrong",
    message: error instanceof Error ? error.message : "Unknown error",
  };
}

export function ErrorState({
  error,
  onRetry,
  className,
  compact,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}) {
  const { title, message, requestId } = describeError(error);
  return (
    <div
      role="alert"
      className={cn(
        "rounded-md border border-critical/25 bg-critical-subtle/50",
        compact ? "px-3 py-2.5" : "px-4 py-4",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">{title}</p>
          <p className="mt-0.5 text-sm text-fg-secondary">{message}</p>
          {requestId ? (
            <p className="mt-1 font-mono text-2xs text-fg-tertiary">request {requestId}</p>
          ) : null}
        </div>
        {onRetry ? (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            <RefreshCw /> Retry
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function InlineSpinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-3.5 animate-spin rounded-full border-2 border-border-strong border-t-fg",
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  );
}
