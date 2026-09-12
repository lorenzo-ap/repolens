"use client";

import type { AnalysisSummary } from "@repolens/shared";
import {
  ChevronDown,
  ExternalLink,
  GitBranch,
  History,
  LayoutDashboard,
  ListChecks,
  Menu,
  Network,
  Package,
  Play,
  RefreshCw,
  Sigma,
  TestTube2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { TopBar } from "@/components/layout/header";
import { DemoBadge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import {
  Dialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  SheetContent,
} from "@/components/ui/overlay";
import { ScoreText } from "@/components/ui/score";
import { ApiClientError } from "@/lib/api";
import { useAnalyses, useRepository, useStartAnalysis } from "@/lib/queries";
import { cn, formatDate, relativeTime, shortSha } from "@/lib/utils";
import { buildHref, RepoContext, type RepoContextValue } from "./context";

const NAV = [
  { key: "", label: "Overview", icon: LayoutDashboard },
  { key: "findings", label: "Findings", icon: ListChecks },
  { key: "architecture", label: "Architecture", icon: Network },
  { key: "dependencies", label: "Dependencies", icon: Package },
  { key: "testing", label: "Testing", icon: TestTube2 },
  { key: "complexity", label: "Complexity", icon: Sigma },
  { key: "git", label: "Git history", icon: GitBranch },
  { key: "analyses", label: "Analyses", icon: History },
] as const;

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
  const isProgressRoute = /\/analyses\/[^/]+$/.test(pathname);
  const [navOpen, setNavOpen] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: close the mobile nav on navigation
  useEffect(() => setNavOpen(false), [pathname]);

  const value = useMemo<RepoContextValue | null>(() => {
    if (!repo.data || !analyses.data) return null;
    const list = analyses.data.analyses;
    const latestCompleted = repo.data.latestAnalysis;
    const selected = selectedId ? (list.find((a) => a.id === selectedId) ?? null) : null;
    const analysis = selected?.status === "completed" ? selected : latestCompleted;
    const isLatest = !analysis || analysis.id === latestCompleted?.id;
    const preserveQuery = analysis && !isLatest ? `analysis=${analysis.id}` : "";
    const completed = list
      .filter((a) => a.status === "completed")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const idx = analysis ? completed.findIndex((a) => a.id === analysis.id) : -1;
    return {
      owner,
      name,
      base,
      repository: repo.data.repository,
      analysis,
      previous: idx > 0 ? (completed[idx - 1] ?? null) : null,
      analyses: list,
      latestCompleted,
      active: repo.data.activeAnalysis,
      isLatest,
      preserveQuery,
      href: buildHref(base, preserveQuery),
    };
  }, [repo.data, analyses.data, selectedId, owner, name, base]);

  const onAnalyze = async () => {
    try {
      const res = await start.mutateAsync();
      if (!res.created) toast.info("An analysis is already in progress");
      router.push(`${base}/analyses/${res.analysis.id}`);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not start the analysis");
    }
  };

  const crumb = (
    <span className="flex min-w-0 items-center gap-1.5 text-sm">
      <span className="hidden text-fg-tertiary sm:inline">{owner}</span>
      <span className="hidden text-fg-tertiary sm:inline" aria-hidden>
        /
      </span>
      <span className="truncate font-medium text-fg">{name}</span>
      {value?.repository.isDemo ? <DemoBadge className="ml-1" /> : null}
    </span>
  );

  if (repo.isError) {
    const err = repo.error;
    const notFound = err instanceof ApiClientError && err.status === 404;
    return (
      <>
        <TopBar crumb={crumb} />
        <main id="main" className="mx-auto max-w-md px-6 py-24">
          {notFound ? (
            <div>
              <p className="font-mono text-xs text-fg-tertiary">404</p>
              <h1 className="mt-2 text-xl">Repository not found</h1>
              <p className="mt-2 text-sm text-fg-secondary">
                <span className="font-mono">
                  {owner}/{name}
                </span>{" "}
                has not been added to RepoLens, or it belongs to another account.
              </p>
              <div className="mt-5 flex gap-2">
                <Button asChild variant="primary">
                  <Link href="/repos">Your repositories</Link>
                </Button>
                <Button asChild>
                  <Link href="/demo">Open the demo</Link>
                </Button>
              </div>
            </div>
          ) : (
            <ErrorState error={err} onRetry={() => repo.refetch()} />
          )}
        </main>
      </>
    );
  }

  const sidebar = value ? (
    <Sidebar
      value={value}
      pathname={pathname}
      onAnalyze={onAnalyze}
      starting={start.isPending}
      isProgressRoute={isProgressRoute}
    />
  ) : (
    <div className="space-y-2 p-4" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={`nav-${i.toString()}`} className="h-7" />
      ))}
    </div>
  );

  return (
    <RepoContext.Provider value={value}>
      <TopBar crumb={crumb}>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-1 lg:hidden"
          aria-label="Open repository navigation"
          onClick={() => setNavOpen(true)}
        >
          <Menu />
        </Button>
      </TopBar>
      <div className="flex min-h-[calc(100vh-var(--topbar-h))]">
        <aside
          className="sticky top-[var(--topbar-h)] hidden h-[calc(100vh-var(--topbar-h))] w-[var(--sidebar-w)] shrink-0 flex-col border-r border-border bg-bg-subtle lg:flex"
          aria-label="Repository navigation"
        >
          {sidebar}
        </aside>
        <Dialog open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent
            title={`${owner}/${name}`}
            width="max-w-[300px]"
            className="left-0 right-auto border-l-0 border-r"
          >
            {sidebar}
          </SheetContent>
        </Dialog>
        <main id="main" className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1280px] px-4 py-5 sm:px-6 lg:px-8">
            {value ? (
              children
            ) : (
              <div className="space-y-4">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-80" />
                <Skeleton className="mt-6 h-40" />
                <Skeleton className="h-64" />
              </div>
            )}
          </div>
        </main>
      </div>
    </RepoContext.Provider>
  );
}

function Sidebar({
  value,
  pathname,
  onAnalyze,
  starting,
  isProgressRoute,
}: {
  value: RepoContextValue;
  pathname: string;
  onAnalyze: () => void;
  starting: boolean;
  isProgressRoute: boolean;
}) {
  const { repository, analysis, active, isLatest, base } = value;
  const findingCount = analysis?.findingSummary?.total;

  return (
    <div className="flex h-full flex-col">
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Sections">
        <ul className="space-y-px">
          {NAV.map((item) => {
            const href = item.key ? `${base}/${item.key}` : base;
            const activeNav = item.key
              ? pathname === href ||
                (pathname.startsWith(`${href}/`) && !(item.key === "analyses" && isProgressRoute))
              : pathname === base;
            const Icon = item.icon;
            return (
              <li key={item.key}>
                <Link
                  href={value.href(item.key)}
                  aria-current={activeNav ? "page" : undefined}
                  className={cn(
                    "group relative flex h-7 items-center gap-2 rounded-sm pl-2.5 pr-2 text-sm transition-colors",
                    activeNav
                      ? "bg-bg-emphasis font-medium text-fg"
                      : "text-fg-secondary hover:bg-bg-muted hover:text-fg",
                  )}
                >
                  {activeNav ? (
                    <span
                      className="absolute -left-2 top-1.5 h-4 w-0.5 rounded-full bg-fg"
                      aria-hidden
                    />
                  ) : null}
                  <Icon
                    className={cn(
                      "size-3.5 shrink-0",
                      activeNav ? "text-fg" : "text-fg-tertiary group-hover:text-fg-secondary",
                    )}
                    aria-hidden
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.key === "findings" && findingCount !== undefined ? (
                    <span className="tabular text-2xs text-fg-tertiary">{findingCount}</span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border p-3">
        <div className="eyebrow mb-2">Viewing</div>
        <AnalysisSelector value={value} pathname={isProgressRoute ? base : pathname} />
        {analysis ? (
          <dl className="mt-2 space-y-0.5 text-xs text-fg-tertiary">
            <div className="flex justify-between gap-2">
              <dt>Commit date</dt>
              <dd className="text-fg-secondary">
                {formatDate(analysis.commitDate ?? analysis.createdAt)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Analyzed</dt>
              <dd className="text-fg-secondary">
                {relativeTime(analysis.finishedAt ?? analysis.createdAt)}
              </dd>
            </div>
          </dl>
        ) : null}
        {!isLatest ? (
          <Link
            href={isProgressRoute ? base : pathname}
            className="mt-2 inline-block text-xs text-accent hover:underline"
          >
            Switch to latest
          </Link>
        ) : null}
        {active && !isProgressRoute ? (
          <Link
            href={`${base}/analyses/${active.id}`}
            className="mt-3 flex items-center justify-between gap-2 rounded-sm border border-border bg-bg px-2 py-1.5 text-xs hover:border-border-strong"
          >
            <span className="text-fg-secondary">Analysis in progress</span>
            <StatusBadge status={active.status} />
          </Link>
        ) : null}
        <div className="mt-3 flex items-center gap-2">
          {repository.canManage ? (
            <Button
              size="sm"
              variant="primary"
              className="flex-1"
              onClick={onAnalyze}
              loading={starting}
              disabled={Boolean(active)}
            >
              {analysis ? <RefreshCw /> : <Play />}
              {analysis ? "Re-analyze" : "Analyze"}
            </Button>
          ) : null}
          <Button
            asChild
            size="sm"
            variant="ghost"
            className={repository.canManage ? "" : "flex-1 justify-start"}
          >
            <a href={repository.htmlUrl} target="_blank" rel="noreferrer">
              <ExternalLink /> GitHub
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

function AnalysisSelector({ value, pathname }: { value: RepoContextValue; pathname: string }) {
  const { analyses, analysis, latestCompleted, base } = value;
  const completed = analyses.filter((a) => a.status === "completed");
  if (completed.length === 0) {
    return <p className="text-xs text-fg-tertiary">No completed analysis yet.</p>;
  }
  const label = (a: AnalysisSummary) => (
    <span className="flex min-w-0 items-center gap-2">
      <span className="font-mono text-xs text-fg">{shortSha(a.commitSha)}</span>
      {a.branch ? <span className="truncate text-xs text-fg-tertiary">{a.branch}</span> : null}
    </span>
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-8 w-full items-center justify-between gap-2 rounded-sm border border-border bg-bg px-2 text-left shadow-sm transition-colors hover:border-border-strong"
          aria-label="Select analysis"
        >
          {analysis ? label(analysis) : <span className="text-xs text-fg-tertiary">Select…</span>}
          <span className="flex items-center gap-1.5">
            {analysis ? <ScoreText score={analysis.healthScore} className="text-xs" /> : null}
            <ChevronDown className="size-3.5 text-fg-tertiary" aria-hidden />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[260px]">
        <DropdownMenuLabel>Completed analyses</DropdownMenuLabel>
        {completed.slice(0, 12).map((a) => (
          <DropdownMenuItem key={a.id} asChild>
            <Link
              href={a.id === latestCompleted?.id ? pathname : `${pathname}?analysis=${a.id}`}
              className="justify-between"
            >
              <span className="flex min-w-0 flex-col">
                {label(a)}
                <span className="text-2xs text-fg-tertiary">
                  {formatDate(a.commitDate ?? a.createdAt)}
                  {a.id === latestCompleted?.id ? " · latest" : ""}
                </span>
              </span>
              <ScoreText score={a.healthScore} className="text-xs" />
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem asChild>
          <Link href={`${base}/analyses`} className="text-fg-secondary">
            All analyses…
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
