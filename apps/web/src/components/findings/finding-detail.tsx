"use client";

import type { Finding } from "@repolens/shared";
import { CATEGORY_LABELS } from "@repolens/shared";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useRepo } from "@/components/repo/context";
import { Badge, SeverityBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CodeBlock, FilePath, InlineCode } from "@/components/ui/code";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { GithubIcon } from "@/components/ui/icons";
import { ApiClientError } from "@/lib/api";
import { useCreateIssue, useFinding } from "@/lib/queries";
import { FindingRow } from "./finding-row";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-4">
      <h3 className="eyebrow mb-2">{title}</h3>
      {children}
    </section>
  );
}

/** "vulnerableRange" -> "Vulnerable range", "fan_in" -> "Fan in". */
function humanize(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

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
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="mt-4 h-24" />
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
  const data = f.evidence.data ? Object.entries(f.evidence.data).filter(([k]) => k !== "url") : [];
  const url = typeof f.evidence.data?.url === "string" ? f.evidence.data.url : null;

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
    <article className="space-y-4 p-5">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={f.severity} />
          <Badge tone="outline">{CATEGORY_LABELS[f.category]}</Badge>
          <InlineCode className="text-2xs">{f.ruleId}</InlineCode>
        </div>
        <h2 className="mt-3 text-lg font-semibold leading-6 text-fg">{f.title}</h2>
        {f.filePath ? (
          <p className="mt-1.5 flex flex-wrap items-center gap-2">
            <FilePath path={f.filePath} line={f.line} />
            {f.endLine && f.line && f.endLine > f.line ? (
              <span className="font-mono text-xs text-fg-tertiary">–{f.endLine}</span>
            ) : null}
            {githubFileUrl ? (
              <a
                href={githubFileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                Open on GitHub <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : null}
          </p>
        ) : null}
      </header>

      <Section title="Why this matters">
        <p className="text-sm leading-6 text-fg">{f.message}</p>
      </Section>

      {f.evidence.snippet ? (
        <Section title="Code">
          <CodeBlock
            code={f.evidence.snippet}
            startLine={f.line ?? 1}
            highlightLine={f.line}
            title={f.filePath ?? undefined}
          />
        </Section>
      ) : null}

      {data.length ? (
        <Section title="Evidence">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            {data.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="truncate text-2xs uppercase tracking-[0.06em] text-fg-tertiary">
                  {humanize(k)}
                </dt>
                <dd className="tabular truncate font-mono text-xs text-fg" title={String(v)}>
                  {String(v)}
                </dd>
              </div>
            ))}
          </dl>
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline"
            >
              Advisory details <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : null}
        </Section>
      ) : null}

      {f.evidence.relatedPaths?.length ? (
        <Section title={`Affected files (${f.evidence.relatedPaths.length})`}>
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border bg-bg-subtle p-2.5">
            {f.evidence.relatedPaths.map((p) => (
              <li key={p} className="truncate">
                <FilePath path={p} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Recommendation">
        <p className="text-sm leading-6 text-fg">{linkify(f.recommendation)}</p>
      </Section>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {f.githubIssueUrl ? (
          <Button asChild size="sm">
            <a href={f.githubIssueUrl} target="_blank" rel="noreferrer">
              <GithubIcon /> View issue
            </a>
          </Button>
        ) : repo.repository.canManage ? (
          <Button size="sm" variant="secondary" onClick={onIssue} loading={createIssue.isPending}>
            <GithubIcon /> Create GitHub issue
          </Button>
        ) : repo.repository.isDemo ? (
          <span className="text-xs text-fg-tertiary">
            Issue creation is disabled for the demo repository.
          </span>
        ) : null}
      </div>

      {related.length ? (
        <Section title="Also in this file">
          <div className="hairlines overflow-hidden rounded-md border border-border">
            {related.map((r: Finding) => (
              <FindingRow
                key={r.id}
                finding={r}
                onClick={() => onSelect(r.id)}
                showCategory={false}
                className="px-3 py-1.5"
              />
            ))}
          </div>
        </Section>
      ) : null}
    </article>
  );
}

/** Turns bare https URLs inside plain text into links. */
function linkify(text: string): React.ReactNode[] {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={`${i.toString()}-${part}`}
        href={part}
        target="_blank"
        rel="noreferrer"
        className="break-all text-accent hover:underline"
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}
