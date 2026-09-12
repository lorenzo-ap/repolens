"use client";

import type { AnalysisSummary } from "@repolens/shared";
import { isActiveStatus } from "@repolens/shared";
import { AlertTriangle, ChevronDown, ExternalLink, History, Play, RefreshCw } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { toast } from "sonner";
import { DemoBadge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/overlay";
import { ScoreText } from "@/components/ui/score";
import { LinkTabs } from "@/components/ui/tabs";
import { ApiClientError } from "@/lib/api";
import { useAnalyses, useRepository, useStartAnalysis } from "@/lib/queries";
import { formatDate, relativeTime, shortSha } from "@/lib/utils";
import { RepoContext, type RepoContextValue } from "./context";

export function RepoShell({
  owner,
  name,
  children,
}: {
  owner: string;
  name: string;
  children: React.ReactNode;
}) {
  const repo = useRepository(owner, name);
  const analyses = useAnalyses(owner, name);
  const search = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const start = useStartAnalysis(owner, name);
  const selectedId = search.get("analysis");
  const base = `/r/${owner}/${name}`;
  const isProgressRoute = pathname.startsWith(`${base}/analyses/`);

  const value = useMemo<RepoContextValue | null>(() => {
    if (!repo.data || !analyses.data) return null;
    const list = analyses.data.analyses;
    const latestCompleted = repo.data.latestAnalysis;
    const selected = selectedId ? (list.find((a) => a.id === selectedId) ?? null) : null;
    const analysis = selected?.status === "completed" ? selected : latestCompleted;
    const isLatest = !analysis || analysis.id === latestCompleted?.id;
    return {
      owner,
      name,
      repository: repo.data.repository,
      analysis,
      analyses: list,
      latestCompleted,
      active: repo.data.activeAnalysis,
      isLatest,
      preserveQuery: analysis && !isLatest ? `analysis=${analysis.id}` : "",
    };
  }, [repo.data, analyses.data, selectedId, owner, name]);

  const onAnalyze = async () => {
    try {
      const res = await start.mutateAsync();
      if (!res.created) toast.info("An analysis is already in progress");
      router.push(`${base}/analyses/${res.analysis.id}`);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not start the analysis");
    }
  };

  if (repo.isError) {
    const err = repo.error;
    const notFound = err instanceof ApiClientError && err.status === 404;
    return (
      <div className="py-12">
        {notFound ? (
          <div className="mx-auto max-w-md text-center">
            <h1 className="text-xl">Repository not found</h1>
            <p className="mt-2 text-sm text-fg-muted">
              <span className="font-mono">
                {owner}/{name}
              </span>{" "}
              has not been added to RepoLens, or it belongs to another account.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Button asChild variant="primary">
                <Link href="/repos">Your repositories</Link>
              </Button>
              <Button asChild>
                <Link href="/demo">Explore the demo</Link>
              </Button>
            </div>
          </div>
        ) : (
          <ErrorState error={err} onRetry={() => repo.refetch()} />
        )}
      </div>
    );
  }

  if (!value) {
    return (
      <div className="py-6">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="mt-2 h-4 w-96" />
        <Skeleton className="mt-6 h-9 w-full max-w-md" />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  const { repository, analysis, active, isLatest } = value;
  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/findings`, label: "Findings", count: analysis?.findingSummary?.total },
    { href: `${base}/architecture`, label: "Architecture" },
    {
      href: `${base}/history`,
      label: "History",
      count: value.analyses.filter((a) => a.status === "completed").length,
    },
  ];

  return (
    <RepoContext.Provider value={value}>
      <div className="pt-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-mono text-lg font-semibold">
                <span className="text-fg-muted">{repository.owner}/</span>
                {repository.name}
              </h1>
              <a
                href={repository.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="text-fg-subtle hover:text-fg"
                aria-label="Open on GitHub"
              >
                <ExternalLink className="size-3.5" />
              </a>
              {repository.isDemo ? <DemoBadge /> : null}
              {repository.isPrivate ? (
                <span className="text-2xs uppercase tracking-[0.04em] text-fg-subtle">Private</span>
              ) : null}
            </div>
            {repository.description ? (
              <p className="mt-0.5 max-w-2xl truncate text-sm text-fg-muted">
                {repository.description}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {active && !isProgressRoute ? (
              <Button asChild size="sm" variant="ghost">
                <Link href={`${base}/analyses/${active.id}`}>
                  <StatusBadge status={active.status} /> Analysis in progress
                </Link>
              </Button>
            ) : null}
            <AnalysisSelector
              base={base}
              analyses={value.analyses}
              selected={analysis}
              latestId={value.latestCompleted?.id ?? null}
              pathname={isProgressRoute ? base : pathname}
            />
            {repository.canManage ? (
              <Button
                size="sm"
                variant="primary"
                onClick={onAnalyze}
                loading={start.isPending}
                disabled={Boolean(active)}
              >
                {analysis ? <RefreshCw /> : <Play />}
                {analysis ? "Re-analyze" : "Analyze"}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 border-b border-border">
          <LinkTabs tabs={tabs} preserveQuery={value.preserveQuery} />
        </div>

        {analysis && !isLatest ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-medium/40 bg-medium-bg px-3 py-2 text-sm">
            <History className="size-4 text-medium" aria-hidden />
            <span>
              Viewing the analysis from {formatDate(analysis.finishedAt ?? analysis.createdAt)} (
              {shortSha(analysis.commitSha)}).
            </span>
            <Link
              href={isProgressRoute ? base : pathname}
              className="font-medium text-accent hover:underline"
            >
              View latest
            </Link>
          </div>
        ) : null}

        {!analysis && !active && !isProgressRoute ? (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg-muted">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
            <span>
              No completed analysis yet.
              {value.analyses[0]?.status === "failed"
                ? ` The last attempt failed: ${value.analyses[0].error ?? "unknown error"}.`
                : ""}
              {repository.canManage ? " Start one with the Analyze button." : ""}
            </span>
          </div>
        ) : null}

        <div className="mt-5">{children}</div>
      </div>
    </RepoContext.Provider>
  );
}

function AnalysisSelector({
  base,
  analyses,
  selected,
  latestId,
  pathname,
}: {
  base: string;
  analyses: AnalysisSummary[];
  selected: AnalysisSummary | null;
  latestId: string | null;
  pathname: string;
}) {
  const completed = analyses.filter((a) => a.status === "completed");
  if (completed.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="secondary" aria-label="Select analysis">
          <span className="font-mono text-xs">{shortSha(selected?.commitSha)}</span>
          <span className="text-fg-muted">
            {selected ? relativeTime(selected.finishedAt ?? selected.createdAt) : ""}
          </span>
          {selected && selected.id === latestId ? (
            <span className="text-2xs uppercase tracking-[0.04em] text-fg-subtle">latest</span>
          ) : null}
          <ChevronDown className="text-fg-subtle" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80">
        <DropdownMenuLabel>Analyses</DropdownMenuLabel>
        {completed.slice(0, 12).map((a) => (
          <DropdownMenuItem key={a.id} asChild>
            <Link
              href={a.id === latestId ? pathname : `${pathname}?analysis=${a.id}`}
              className="justify-between"
            >
              <span className="flex items-center gap-2">
                <span className="font-mono text-xs">{shortSha(a.commitSha)}</span>
                <span className="text-fg-muted">{formatDate(a.finishedAt ?? a.createdAt)}</span>
                {a.id === latestId ? (
                  <span className="text-2xs uppercase tracking-[0.04em] text-fg-subtle">
                    latest
                  </span>
                ) : null}
              </span>
              <ScoreText score={a.healthScore} className="text-xs" />
            </Link>
          </DropdownMenuItem>
        ))}
        {analyses.some((a) => isActiveStatus(a.status) || a.status === "failed") ? (
          <>
            <DropdownMenuLabel>Other</DropdownMenuLabel>
            {analyses
              .filter((a) => a.status !== "completed")
              .slice(0, 4)
              .map((a) => (
                <DropdownMenuItem key={a.id} asChild>
                  <Link href={`${base}/analyses/${a.id}`} className="justify-between">
                    <span className="text-fg-muted">{formatDate(a.createdAt)}</span>
                    <StatusBadge status={a.status} />
                  </Link>
                </DropdownMenuItem>
              ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
