"use client";

import type { Finding } from "@repolens/shared";
import { CATEGORY_LABELS } from "@repolens/shared";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useRepo } from "@/components/repo/context";
import { Badge, SeverityBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CodeBlock, InlineCode } from "@/components/ui/code";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { GithubIcon } from "@/components/ui/icons";
import { ApiClientError } from "@/lib/api";
import { useCreateIssue, useFinding } from "@/lib/queries";

export function FindingDetailPanel({
  analysisId,
  findingId,
  onSelect,
}: {
  analysisId: string;
  findingId: string;
  onSelect: (id: string) => void;
}) {
  const repo = useRepo();
  const detail = useFinding(analysisId, findingId);
  const createIssue = useCreateIssue(analysisId);

  if (detail.isPending) {
    return (
      <div className="space-y-3 p-5">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-24" />
        <Skeleton className="h-16" />
      </div>
    );
  }
  if (detail.isError) {
    return (
      <div className="p-5">
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      </div>
    );
  }
  const { finding: f, related, githubFileUrl } = detail.data;
  const data = f.evidence.data ? Object.entries(f.evidence.data) : [];

  const onIssue = async () => {
    try {
      const res = await createIssue.mutateAsync(f.id);
      toast.success(`Issue #${res.number} created`, {
        action: { label: "Open", onClick: () => window.open(res.url, "_blank") },
      });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "conflict")
        toast.info("An issue already exists for this finding");
      else toast.error(err instanceof ApiClientError ? err.message : "Could not create the issue");
    }
  };

  return (
    <div className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={f.severity} full />
        <Badge>{CATEGORY_LABELS[f.category]}</Badge>
        <InlineCode className="text-2xs">{f.ruleId}</InlineCode>
      </div>
      <h2 className="mt-3 text-lg font-semibold leading-6">{f.title}</h2>
      {f.filePath ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-xs text-fg-muted">
          <span className="break-all">
            {f.filePath}
            {f.line ? `:${f.line}` : ""}
            {f.endLine && f.line && f.endLine > f.line ? `–${f.endLine}` : ""}
          </span>
          {githubFileUrl ? (
            <a
              href={githubFileUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              GitHub <ExternalLink className="size-3" />
            </a>
          ) : null}
        </p>
      ) : null}

      <p className="mt-4 text-sm leading-6 text-fg">{f.message}</p>

      {f.evidence.snippet ? (
        <section className="mt-4">
          <h3 className="label-caps mb-1.5">Evidence</h3>
          <CodeBlock code={f.evidence.snippet} startLine={f.line ?? 1} highlightLine={f.line} />
        </section>
      ) : null}
      {data.length ? (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md border border-border bg-surface-2 p-3 text-xs sm:grid-cols-3">
          {data.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="truncate text-fg-subtle">{k}</dt>
              <dd className="tabular truncate font-mono text-fg" title={String(v)}>
                {typeof v === "string" && v.startsWith("http") ? (
                  <a
                    href={v}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:underline"
                  >
                    Open {new URL(v).hostname}
                  </a>
                ) : (
                  String(v)
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {f.evidence.relatedPaths?.length ? (
        <section className="mt-4">
          <h3 className="label-caps mb-1.5">Related files</h3>
          <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-border bg-surface-2 p-2 font-mono text-xs">
            {f.evidence.relatedPaths.map((p) => (
              <li key={p} className="truncate text-fg-muted">
                {p}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-4 rounded-md border border-accent/30 bg-accent-bg/50 p-3">
        <h3 className="label-caps mb-1 text-accent">Recommendation</h3>
        <p className="text-sm leading-6 text-fg">{f.recommendation}</p>
      </section>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {f.githubIssueUrl ? (
          <Button asChild size="sm">
            <a href={f.githubIssueUrl} target="_blank" rel="noreferrer">
              <GithubIcon /> View issue
            </a>
          </Button>
        ) : repo.repository.canManage ? (
          <Button size="sm" variant="primary" onClick={onIssue} loading={createIssue.isPending}>
            <GithubIcon /> Create GitHub issue
          </Button>
        ) : repo.repository.isDemo ? (
          <span className="text-xs text-fg-subtle">
            Issue creation is disabled for the demo repository.
          </span>
        ) : null}
      </div>

      {related.length ? (
        <section className="mt-6">
          <h3 className="label-caps mb-1.5">Also in this file</h3>
          <ul className="divide-y divide-border rounded-md border border-border">
            {related.map((r: Finding) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onSelect(r.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2"
                >
                  <SeverityBadge severity={r.severity} />
                  <span className="min-w-0 flex-1 truncate text-sm">{r.title}</span>
                  {r.line ? (
                    <span className="tabular font-mono text-2xs text-fg-subtle">L{r.line}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
