"use client";

import { isActiveStatus } from "@repolens/shared";
import { Check, Loader2, Minus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page";
import { Panel, PanelFooter } from "@/components/ui/panel";
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
  const base = repo.base;

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

  if (detail.isPending) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <Skeleton className="h-6 w-56" />
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={`st-${i.toString()}`} className="h-9" />
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

  const description =
    analysis.status === "queued"
      ? "Waiting for a worker to pick up the job."
      : analysis.status === "running"
        ? `${runningStep?.label ?? "Working"} · step ${Math.min(done + 1, steps.length)} of ${steps.length}`
        : analysis.status === "completed"
          ? `Finished in ${formatDuration(analysis.durationMs)} with a health score of ${Math.round(analysis.healthScore ?? 0)}. Opening the overview…`
          : analysis.status === "cancelled"
            ? "Cancelled before it started."
            : `Failed after ${formatDuration(analysis.durationMs)}.`;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Analysis <StatusBadge status={analysis.status} />
          </span>
        }
        description={description}
        actions={
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
              <Link href={base}>Open overview</Link>
            </Button>
          ) : repo.repository.canManage ? (
            <Button size="sm" variant="primary" onClick={onRetry} loading={restart.isPending}>
              Retry
            </Button>
          ) : null
        }
      />

      {analysis.error ? (
        <ErrorState error={new Error(analysis.error)} compact className="mb-4" />
      ) : null}

      <Panel>
        <div className="h-0.5 w-full bg-bg-emphasis" aria-hidden>
          <div
            className={cn(
              "h-full bg-fg transition-[width] duration-300",
              analysis.status === "failed" && "bg-critical",
            )}
            style={{ width: `${(done / steps.length) * 100}%` }}
          />
        </div>
        <ol className="hairlines" aria-live="polite" aria-label="Analysis steps">
          {steps.map((s, i) => (
            <li
              key={s.key}
              className={cn(
                "flex items-start gap-3 px-4 py-2",
                s.status === "pending" && "opacity-50",
              )}
            >
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center" aria-hidden>
                {s.status === "completed" ? (
                  <Check className="size-3.5 text-good" />
                ) : s.status === "running" ? (
                  <Loader2 className="size-3.5 animate-spin text-fg" />
                ) : s.status === "failed" ? (
                  <X className="size-3.5 text-critical" />
                ) : s.status === "skipped" ? (
                  <Minus className="size-3.5 text-fg-tertiary" />
                ) : (
                  <span className="size-1.5 rounded-full bg-border-strong" />
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
                    <span className="mr-2 font-mono text-2xs text-fg-tertiary">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {s.label}
                  </span>
                  <span className="tabular shrink-0 font-mono text-2xs text-fg-tertiary">
                    {s.status === "completed" || s.status === "failed"
                      ? formatDuration(s.durationMs)
                      : s.status === "skipped"
                        ? "skipped"
                        : ""}
                  </span>
                </div>
                {s.detail ? (
                  <p className="mt-0.5 truncate text-xs text-fg-tertiary">{s.detail}</p>
                ) : null}
                {s.error ? <p className="mt-0.5 text-xs text-critical">{s.error}</p> : null}
                <span className="sr-only">{s.status}</span>
              </div>
            </li>
          ))}
        </ol>
        <PanelFooter>
          <span>
            Requested {formatDateTime(analysis.createdAt)}
            {analysis.commitSha ? (
              <>
                {" "}
                · commit <span className="font-mono">{analysis.commitSha.slice(0, 7)}</span>
              </>
            ) : null}
            {analysis.branch ? <> · {analysis.branch}</> : null}
          </span>
        </PanelFooter>
      </Panel>
    </div>
  );
}
