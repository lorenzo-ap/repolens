"use client";

import type { GitHubRepo } from "@repolens/shared";
import { ChevronLeft, ChevronRight, ExternalLink, Lock, Play, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { GithubIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { ScoreText } from "@/components/ui/score";
import { Table, TBody, Td, THead, Th, Tr } from "@/components/ui/table";
import { ApiClientError, api } from "@/lib/api";
import { useAddRepository, useGitHubRepos, useMe } from "@/lib/queries";
import { formatBytesKb, relativeTime } from "@/lib/utils";

const AST_LANGUAGES = new Set(["TypeScript", "JavaScript", "Vue", "Svelte", "Astro"]);

export default function ReposPage() {
  const me = useMe();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const deferred = useDeferredValue(query);
  const repos = useGitHubRepos(page, deferred);
  const add = useAddRepository();
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    if (!me.isPending && !me.data?.user) router.replace("/?auth=required");
  }, [me.isPending, me.data, router]);

  const analyze = async (r: GitHubRepo) => {
    setStarting(r.fullName);
    try {
      await add.mutateAsync({ owner: r.owner, name: r.name });
      const res = await api.startAnalysis(r.owner, r.name);
      router.push(`/r/${r.owner}/${r.name}/analyses/${res.analysis.id}`);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not start the analysis");
      setStarting(null);
    }
  };

  if (!me.data?.user)
    return (
      <div className="py-16">
        <Skeleton className="mx-auto h-8 w-64" />
      </div>
    );

  return (
    <div className="py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl">Repositories</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Repositories you own or collaborate on. Analysis runs on the default branch.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-2.5 top-2 size-4 text-fg-subtle"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search your repositories…"
            className="pl-8"
            aria-label="Search repositories"
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
            }}
          />
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-md border border-border bg-surface">
        {repos.isPending ? (
          <div className="space-y-px p-3">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={`row-${i.toString()}`} className="h-9" />
            ))}
          </div>
        ) : repos.isError ? (
          <div className="p-4">
            <ErrorState error={repos.error} onRetry={() => repos.refetch()} />
          </div>
        ) : repos.data.repos.length === 0 ? (
          <EmptyState
            icon={GithubIcon}
            title={deferred ? "No repositories match" : "No repositories found"}
            description={
              deferred
                ? "Try a different search term."
                : "RepoLens lists repositories you own, collaborate on, or that belong to your organizations. Grant access on GitHub if some are missing."
            }
            className="border-0"
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Repository</Th>
                <Th className="hidden md:table-cell">Language</Th>
                <Th className="hidden lg:table-cell">Size</Th>
                <Th className="hidden sm:table-cell">Pushed</Th>
                <Th>Status</Th>
                <Th numeric>Score</Th>
                <Th className="w-28" />
              </tr>
            </THead>
            <TBody>
              {repos.data.repos.map((r) => {
                const latest = r.local?.latestAnalysis ?? null;
                const active = r.local?.activeAnalysis ?? null;
                const limited = !r.primaryLanguage || !AST_LANGUAGES.has(r.primaryLanguage);
                return (
                  <Tr key={r.githubId}>
                    <Td>
                      <div className="flex min-w-0 items-center gap-2">
                        {r.isPrivate ? (
                          <Lock className="size-3.5 shrink-0 text-fg-subtle" aria-label="Private" />
                        ) : null}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {r.local ? (
                              <Link
                                href={`/r/${r.owner}/${r.name}`}
                                className="truncate font-mono text-xs font-medium text-fg hover:underline"
                              >
                                {r.fullName}
                              </Link>
                            ) : (
                              <span className="truncate font-mono text-xs font-medium text-fg">
                                {r.fullName}
                              </span>
                            )}
                            <a
                              href={r.htmlUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-fg-subtle hover:text-fg"
                              aria-label="Open on GitHub"
                            >
                              <ExternalLink className="size-3" />
                            </a>
                          </div>
                          {r.description ? (
                            <p className="truncate text-xs text-fg-subtle">{r.description}</p>
                          ) : null}
                        </div>
                      </div>
                    </Td>
                    <Td className="hidden md:table-cell">
                      <span className="text-fg-muted">{r.primaryLanguage ?? "–"}</span>
                      {limited ? (
                        <span className="ml-1.5 text-2xs text-fg-subtle">(no AST)</span>
                      ) : null}
                    </Td>
                    <Td className="hidden text-fg-muted lg:table-cell">
                      {formatBytesKb(r.sizeKb)}
                    </Td>
                    <Td className="hidden text-fg-muted sm:table-cell">
                      {relativeTime(r.pushedAt)}
                    </Td>
                    <Td>
                      {active ? (
                        <Link href={`/r/${r.owner}/${r.name}/analyses/${active.id}`}>
                          <StatusBadge status={active.status} />
                        </Link>
                      ) : latest ? (
                        <span className="text-xs text-fg-muted">
                          Analyzed {relativeTime(latest.finishedAt ?? latest.createdAt)}
                        </span>
                      ) : (
                        <span className="text-xs text-fg-subtle">Never analyzed</span>
                      )}
                    </Td>
                    <Td numeric>
                      <ScoreText score={latest?.healthScore ?? null} />
                    </Td>
                    <Td className="text-right">
                      {active ? (
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/r/${r.owner}/${r.name}/analyses/${active.id}`}>
                            View progress
                          </Link>
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant={latest ? "secondary" : "primary"}
                          loading={starting === r.fullName}
                          onClick={() => analyze(r)}
                          disabled={starting !== null}
                        >
                          <Play /> {latest ? "Re-analyze" : "Analyze"}
                        </Button>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </div>

      {repos.data ? (
        <div className="mt-3 flex items-center justify-between text-xs text-fg-muted">
          <span>Page {repos.data.page}</span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft /> Previous
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!repos.data.hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
