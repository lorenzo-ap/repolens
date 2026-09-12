"use client";

import type { DependenciesMetrics } from "@repolens/shared";
import { ExternalLink, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRepo } from "@/components/repo/context";
import { Badge, SeverityDot } from "@/components/ui/badge";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Input, NativeSelect } from "@/components/ui/input";
import { Figure, MetricList, MetricRow } from "@/components/ui/metric";
import { PageHeader } from "@/components/ui/page";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { ScoreText } from "@/components/ui/score";
import { Table, TBody, Td, THead, Th, Tr } from "@/components/ui/table";
import { useMetrics } from "@/lib/queries";
import { fmt } from "@/lib/utils";

type Row = {
  name: string;
  range: string;
  dev: boolean;
  status: "ok" | "unbounded" | "git" | "deprecated";
  note?: string;
  advisories: number;
  worst: "critical" | "high" | "moderate" | "low" | null;
};

const SEV_RANK = { critical: 0, high: 1, moderate: 2, low: 3 } as const;

function buildRows(d: DependenciesMetrics): Row[] {
  const unpinned = new Map(d.unpinnedRanges.map((u) => [u.name, u.range]));
  const git = new Map(d.gitOrUrlDeps.map((g) => [g.name, g.spec]));
  const deprecated = new Map(d.deprecatedPackages.map((p) => [p.name, p.reason]));
  const advisories = new Map<string, { count: number; worst: Row["worst"] }>();
  for (const a of d.vulnerabilities?.advisories ?? []) {
    const cur = advisories.get(a.package) ?? { count: 0, worst: null };
    const sev = (a.severity in SEV_RANK ? a.severity : "low") as keyof typeof SEV_RANK;
    cur.count++;
    if (!cur.worst || SEV_RANK[sev] < SEV_RANK[cur.worst]) cur.worst = sev;
    advisories.set(a.package, cur);
  }
  const names = new Set<string>([
    ...d.topDependencies.map((t) => t.name),
    ...unpinned.keys(),
    ...git.keys(),
    ...deprecated.keys(),
  ]);
  const rows: Row[] = [];
  for (const name of names) {
    const top = d.topDependencies.find((t) => t.name === name);
    const adv = advisories.get(name);
    rows.push({
      name,
      range: top?.range ?? unpinned.get(name) ?? git.get(name) ?? "",
      dev: top?.dev ?? false,
      status: git.has(name)
        ? "git"
        : deprecated.has(name)
          ? "deprecated"
          : unpinned.has(name)
            ? "unbounded"
            : "ok",
      note: deprecated.get(name),
      advisories: adv?.count ?? 0,
      worst: adv?.worst ?? null,
    });
  }
  return rows;
}

const STATUS_LABEL: Record<Row["status"], string> = {
  ok: "Pinned range",
  unbounded: "Unbounded range",
  git: "Git / URL source",
  deprecated: "Deprecated",
};

export function DependenciesView() {
  const repo = useRepo();
  const metrics = useMetrics(repo.analysis?.id ?? null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | Row["status"]>("all");
  const d = metrics.data?.metrics.dependencies ?? null;
  const rows = useMemo(() => (d ? buildRows(d) : []), [d]);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows
      .filter((r) => (status === "all" ? true : r.status === status))
      .filter((r) => (term ? r.name.toLowerCase().includes(term) : true))
      .sort((a, b) => {
        const order = { git: 0, deprecated: 1, unbounded: 2, ok: 3 };
        return order[a.status] - order[b.status] || a.name.localeCompare(b.name);
      });
  }, [rows, q, status]);
  const score = repo.analysis?.categoryScores?.dependencies ?? null;

  if (!repo.analysis) return <EmptyState title="No analysis yet" />;
  if (metrics.isPending)
    return (
      <>
        <PageHeader title="Dependencies" />
        <Skeleton className="h-24" />
        <Skeleton className="mt-6 h-96" />
      </>
    );
  if (metrics.isError)
    return <ErrorState error={metrics.error} onRetry={() => metrics.refetch()} />;
  if (!d) return <EmptyState title="Dependencies analyzer did not run" />;
  const v = d.vulnerabilities;

  return (
    <>
      <PageHeader
        title="Dependencies"
        description={`${fmt(d.manifests)} manifest${d.manifests === 1 ? "" : "s"} · ${d.lockfilePresent ? `${d.lockfileType} lockfile` : "no lockfile"} · ${fmt(d.resolvedPackages)} resolved packages`}
        actions={
          <Link
            href={repo.href("findings", "category=dependencies")}
            className="text-xs text-accent hover:underline"
          >
            Dependency findings
          </Link>
        }
      />

      <section className="grid gap-8 md:grid-cols-[180px_minmax(0,1fr)]">
        <Figure
          label="Dependency score"
          value={<ScoreText score={score} className="text-2xl font-semibold" />}
          unit="/ 100"
        />
        <MetricList columns={2}>
          <MetricRow label="Direct dependencies" value={fmt(d.direct)} />
          <MetricRow label="Dev dependencies" value={fmt(d.directDev)} />
          <MetricRow
            label="Lockfile"
            value={d.lockfilePresent ? d.lockfileType : "missing"}
            tone={d.lockfilePresent ? undefined : "bad"}
          />
          <MetricRow label="Resolved packages" value={fmt(d.resolvedPackages)} />
          <MetricRow
            label="Advisories"
            hint={v ? `checked ${new Date(v.checkedAt).toLocaleDateString("en-US")}` : undefined}
            value={
              v
                ? `${v.critical} critical · ${v.high} high · ${v.moderate} moderate · ${v.low} low`
                : "not checked"
            }
            tone={v ? (v.critical + v.high > 0 ? "bad" : "good") : "muted"}
          />
          <MetricRow
            label="Packages with 3+ versions"
            value={fmt(d.duplicateVersions.filter((x) => x.versions.length > 2).length)}
          />
          <MetricRow
            label="Unbounded ranges"
            value={fmt(d.unpinnedRanges.length)}
            tone={d.unpinnedRanges.length ? "warn" : undefined}
          />
          <MetricRow
            label="Engines"
            value={
              d.engines
                ? Object.entries(d.engines)
                    .map(([k, val]) => `${k} ${val}`)
                    .join(", ")
                : "not declared"
            }
            tone={d.engines ? undefined : "muted"}
          />
        </MetricList>
      </section>

      <Panel className="mt-8">
        <PanelHeader
          title="Direct dependencies"
          description="declared in package.json manifests"
          action={
            <>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2 top-2 size-3.5 text-fg-tertiary"
                  aria-hidden
                />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Filter packages"
                  className="h-7 w-44 pl-7 text-xs"
                  aria-label="Filter packages"
                />
              </div>
              <NativeSelect
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                aria-label="Status filter"
                className="[&>select]:h-7 [&>select]:text-xs"
              >
                <option value="all">All</option>
                <option value="unbounded">Unbounded</option>
                <option value="deprecated">Deprecated</option>
                <option value="git">Git / URL</option>
                <option value="ok">Pinned</option>
              </NativeSelect>
            </>
          }
        />
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-fg-secondary">No packages match.</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Package</Th>
                <Th>Range</Th>
                <Th className="hidden sm:table-cell">Scope</Th>
                <Th>Status</Th>
                <Th numeric>Advisories</Th>
              </tr>
            </THead>
            <TBody>
              {filtered.map((r) => (
                <Tr key={r.name}>
                  <Td mono>
                    <a
                      href={`https://www.npmjs.com/package/${r.name}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      {r.name}
                    </a>
                  </Td>
                  <Td mono className="text-fg-secondary">
                    {r.range || "–"}
                  </Td>
                  <Td className="hidden text-fg-secondary sm:table-cell">
                    {r.dev ? "dev" : "prod"}
                  </Td>
                  <Td>
                    <span className="flex items-center gap-2">
                      <Badge
                        tone={
                          r.status === "ok"
                            ? "neutral"
                            : r.status === "unbounded"
                              ? "medium"
                              : r.status === "deprecated"
                                ? "low"
                                : "high"
                        }
                      >
                        {STATUS_LABEL[r.status]}
                      </Badge>
                      {r.note ? (
                        <span className="hidden truncate text-xs text-fg-tertiary md:inline">
                          {r.note}
                        </span>
                      ) : null}
                    </span>
                  </Td>
                  <Td numeric>
                    {r.advisories ? (
                      <span className="inline-flex items-center gap-1.5">
                        {r.worst ? (
                          <SeverityDot severity={r.worst === "moderate" ? "medium" : r.worst} />
                        ) : null}
                        {r.advisories}
                      </span>
                    ) : (
                      <span className="text-fg-tertiary">–</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      {v?.advisories.length ? (
        <Panel className="mt-6">
          <PanelHeader
            title="Security advisories"
            description={`${v.advisories.length} matches across resolved packages, including transitive and dev dependencies`}
          />
          <Table>
            <THead>
              <tr>
                <Th>Severity</Th>
                <Th>Package</Th>
                <Th>Advisory</Th>
                <Th className="hidden md:table-cell">Vulnerable range</Th>
              </tr>
            </THead>
            <TBody>
              {v.advisories.slice(0, 60).map((a) => (
                <Tr key={`${a.package}@${a.version}:${a.url}`}>
                  <Td>
                    <span className="inline-flex items-center gap-1.5 text-xs capitalize text-fg-secondary">
                      <SeverityDot
                        severity={
                          a.severity === "moderate"
                            ? "medium"
                            : a.severity === "critical" ||
                                a.severity === "high" ||
                                a.severity === "low"
                              ? a.severity
                              : "info"
                        }
                      />
                      {a.severity}
                    </span>
                  </Td>
                  <Td mono>
                    {a.package}
                    <span className="text-fg-tertiary">@{a.version}</span>
                  </Td>
                  <Td className="max-w-[420px]">
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-full items-center gap-1 hover:underline"
                    >
                      <span className="truncate">{a.title}</span>
                      <ExternalLink className="size-3 shrink-0 text-fg-tertiary" aria-hidden />
                    </a>
                  </Td>
                  <Td mono className="hidden text-fg-secondary md:table-cell">
                    {a.vulnerableRange}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Panel>
      ) : null}

      {d.duplicateVersions.length ? (
        <Panel className="mt-6">
          <PanelHeader
            title="Duplicate versions"
            description="packages resolved at more than one version in the lockfile"
          />
          <Table>
            <THead>
              <tr>
                <Th>Package</Th>
                <Th numeric>Versions</Th>
                <Th>Resolved</Th>
              </tr>
            </THead>
            <TBody>
              {d.duplicateVersions.slice(0, 30).map((dup) => (
                <Tr key={dup.name}>
                  <Td mono>{dup.name}</Td>
                  <Td numeric>{dup.versions.length}</Td>
                  <Td mono className="text-fg-secondary">
                    {dup.versions.join(", ")}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Panel>
      ) : null}
    </>
  );
}
