"use client";

import { isActiveStatus } from "@repolens/shared";
import { Check, Circle, Loader2, Minus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { ApiClientError } from "@/lib/api";
import { useAnalysis, useCancelAnalysis, useStartAnalysis } from "@/lib/queries";
import { cn, formatDateTime, formatDuration } from "@/lib/utils";
import { useRepo } from "./context";

export function AnalysisProgress({ analysisId }: { analysisId: string }) {
  const repo = useRepo();
  const router = useRouter();
  const detail = useAnalysis(analysisId);
  const cancel = useCancelAnalysis();
  const restart = useStartAnalysis(repo.owner, repo.name);
  const base = `/r/${repo.owner}/${repo.name}`;
  const announced = useRef<string | null>(null);

  const status = detail.data?.analysis.status;
  useEffect(() => {
    if (status === "completed") {
      const isLatest =
        repo.latestCompleted === null ||
        repo.latestCompleted.id === analysisId ||
        repo.latestCompleted.createdAt <= (detail.data?.analysis.createdAt ?? "");
      const t = setTimeout(
        () => router.replace(isLatest ? base : `${base}?analysis=${analysisId}`),
        900,
      );
      return () => clearTimeout(t);
    }
  }, [status, router, base, analysisId, repo.latestCompleted, detail.data?.analysis.createdAt]);

  useEffect(() => {
    if (!detail.data) return;
    const running = detail.data.steps.find((s) => s.status === "running");
    if (running && announced.current !== running.key) announced.current = running.key;
  }, [detail.data]);

  if (detail.isPending) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <Skeleton className="h-8 w-56" />
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={`st-${i.toString()}`} className="h-10" />
        ))}
      </div>
    );
  }
  if (detail.isError) return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />;
  const { analysis, steps } = detail.data;
  const active = isActiveStatus(analysis.status);
  const runningStep = steps.find((s) => s.status === "running");
  const done = steps.filter((s) => s.status === "completed").length;

  const onRetry = async () => {
    try {
      const res = await restart.mutateAsync();
      router.replace(`${base}/analyses/${res.analysis.id}`);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not start the analysis");
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              Analysis <StatusBadge status={analysis.status} />
            </span>
          }
          description={
            analysis.status === "queued"
              ? "Waiting for a worker to pick up the job…"
              : analysis.status === "running"
                ? `${runningStep?.label ?? "Working"} · step ${Math.min(done + 1, steps.length)} of ${steps.length}`
                : analysis.status === "completed"
                  ? `Finished in ${formatDuration(analysis.durationMs)} · health score ${Math.round(analysis.healthScore ?? 0)}`
                  : analysis.status === "cancelled"
                    ? "Cancelled before it started."
                    : `Failed after ${formatDuration(analysis.durationMs)}`
          }
          action={
            active ? (
              analysis.status === "queued" && repo.repository.canManage ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => cancel.mutate(analysisId)}
                  loading={cancel.isPending}
                >
                  Cancel
                </Button>
              ) : null
            ) : analysis.status === "completed" ? (
              <Button asChild size="sm" variant="primary">
                <Link href={base}>Open dashboard</Link>
              </Button>
            ) : repo.repository.canManage ? (
              <Button size="sm" variant="primary" onClick={onRetry} loading={restart.isPending}>
                Retry
              </Button>
            ) : null
          }
        />
        <div className="h-1 w-full bg-surface-3" aria-hidden>
          <div
            className={cn(
              "h-full bg-accent transition-[width] duration-300",
              analysis.status === "failed" && "bg-critical",
            )}
            style={{ width: `${(done / steps.length) * 100}%` }}
          />
        </div>
        {analysis.error ? (
          <CardBody className="border-b border-border">
            <ErrorState error={new Error(analysis.error)} compact />
          </CardBody>
        ) : null}
        <ol className="divide-y divide-border" aria-live="polite" aria-label="Analysis steps">
          {steps.map((s, i) => (
            <li
              key={s.key}
              className={cn(
                "flex items-start gap-3 px-4 py-2.5",
                s.status === "pending" && "opacity-60",
              )}
            >
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center" aria-hidden>
                {s.status === "completed" ? (
                  <Check className="size-4 text-good" />
                ) : s.status === "running" ? (
                  <Loader2 className="size-4 animate-spin text-accent" />
                ) : s.status === "failed" ? (
                  <X className="size-4 text-critical" />
                ) : s.status === "skipped" ? (
                  <Minus className="size-4 text-fg-subtle" />
                ) : (
                  <Circle className="size-3 text-border-strong" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={cn(
                      "text-sm",
                      s.status === "running" ? "font-medium text-fg" : "text-fg",
                    )}
                  >
                    <span className="mr-2 font-mono text-2xs text-fg-subtle">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {s.label}
                  </span>
                  <span className="tabular shrink-0 text-xs text-fg-subtle">
                    {s.status === "completed" || s.status === "failed"
                      ? formatDuration(s.durationMs)
                      : s.status === "skipped"
                        ? "skipped"
                        : ""}
                  </span>
                </div>
                {s.detail ? (
                  <p className="mt-0.5 truncate text-xs text-fg-muted">{s.detail}</p>
                ) : null}
                {s.error ? <p className="mt-0.5 text-xs text-critical">{s.error}</p> : null}
                <span className="sr-only">{s.status}</span>
              </div>
            </li>
          ))}
        </ol>
        <div className="border-t border-border px-4 py-2 text-xs text-fg-subtle">
          Requested {formatDateTime(analysis.createdAt)}
          {analysis.commitSha ? (
            <>
              {" "}
              · commit <span className="font-mono">{analysis.commitSha.slice(0, 7)}</span>
            </>
          ) : null}
          {analysis.branch ? <> · {analysis.branch}</> : null}
        </div>
      </Card>
    </div>
  );
}
