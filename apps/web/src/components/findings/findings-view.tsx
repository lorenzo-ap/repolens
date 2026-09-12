"use client";

import type { Category, Finding, FindingSort, Severity } from "@repolens/shared";
import { CATEGORIES, CATEGORY_LABELS, SEVERITIES } from "@repolens/shared";
import { Filter, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRepo } from "@/components/repo/context";
import { SeverityBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Checkbox, Input, Kbd, NativeSelect } from "@/components/ui/input";
import {
  Dialog,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SheetContent,
} from "@/components/ui/overlay";
import { Table, TBody, Td, THead, Th, Tr } from "@/components/ui/table";
import { useFindings } from "@/lib/queries";
import { useUrlParams } from "@/lib/use-url-params";
import { cn, fmt, SEVERITY_FULL, truncateMiddle } from "@/lib/utils";
import { FindingDetailPanel } from "./finding-detail";

const PAGE = 50;

interface Filters {
  severity: Severity[];
  category: Category[];
  path: string;
  q: string;
  ruleId: string;
  sort: FindingSort;
}

function readFilters(sp: URLSearchParams): Filters {
  const sev = sp
    .getAll("severity")
    .filter((s): s is Severity => (SEVERITIES as readonly string[]).includes(s));
  const cat = sp
    .getAll("category")
    .filter((c): c is Category => (CATEGORIES as readonly string[]).includes(c));
  const sort = sp.get("sort");
  return {
    severity: sev,
    category: cat,
    path: sp.get("path") ?? "",
    q: sp.get("q") ?? "",
    ruleId: sp.get("rule") ?? "",
    sort: sort === "file" || sort === "rule" ? sort : "severity",
  };
}

export function FindingsView() {
  const repo = useRepo();
  const pathname = usePathname();
  const sp = useSearchParams();
  const filters = useMemo(() => readFilters(sp), [sp]);
  const selectedId = sp.get("finding");
  const [qInput, setQInput] = useState(filters.q);
  const [pages, setPages] = useState<string[]>([]); // cursors of loaded pages after the first
  const searchRef = useRef<HTMLInputElement>(null);
  const analysisId = repo.analysis?.id ?? null;

  const { update } = useUrlParams();

  // Debounced free-text search.
  useEffect(() => {
    const t = setTimeout(() => {
      if (qInput !== filters.q) update({ q: qInput });
    }, 250);
    return () => clearTimeout(t);
  }, [qInput, filters.q, update]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset pagination when filters change
  useEffect(
    () => setPages([]),
    [
      filters.severity.join(),
      filters.category.join(),
      filters.path,
      filters.q,
      filters.ruleId,
      filters.sort,
      analysisId,
    ],
  );

  const params = useMemo(
    () => ({
      severity: filters.severity,
      category: filters.category,
      path: filters.path || undefined,
      q: filters.q || undefined,
      ruleId: filters.ruleId || undefined,
      sort: filters.sort,
      limit: PAGE,
    }),
    [filters],
  );
  const first = useFindings(analysisId, params);
  const lastCursor = pages[pages.length - 1];
  const more = useFindings(lastCursor ? analysisId : null, { ...params, cursor: lastCursor });
  const [accumulated, setAccumulated] = useState<Finding[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: accumulate pages as they arrive
  useEffect(() => {
    if (pages.length === 0) setAccumulated([]);
    else if (more.data)
      setAccumulated((prev) =>
        prev.some((f) => f.id === more.data.findings[0]?.id)
          ? prev
          : [...prev, ...more.data.findings],
      );
  }, [more.data, pages.length]);
  const rows = useMemo(
    () => [...(first.data?.findings ?? []), ...accumulated],
    [first.data, accumulated],
  );
  const nextCursor = pages.length === 0 ? first.data?.nextCursor : more.data?.nextCursor;

  // Keyboard navigation: j/k move, Enter opens, Esc closes, / focuses search.
  const [cursorIdx, setCursorIdx] = useState(-1);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        setCursorIdx((i) => {
          const n = e.key === "j" ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1);
          document.getElementById(`finding-row-${n}`)?.scrollIntoView({ block: "nearest" });
          return n;
        });
      } else if (e.key === "Enter" && cursorIdx >= 0 && rows[cursorIdx]) {
        update({ finding: rows[cursorIdx].id });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, cursorIdx, update]);

  const activeCount =
    filters.severity.length +
    filters.category.length +
    (filters.path ? 1 : 0) +
    (filters.ruleId ? 1 : 0) +
    (filters.q ? 1 : 0);
  const clearAll = () => {
    setQInput("");
    update({ severity: null, category: null, path: null, q: null, rule: null });
  };

  if (!repo.analysis) {
    return (
      <EmptyState
        title="No findings yet"
        description="Findings appear once an analysis has completed."
      />
    );
  }

  const filterRail = (
    <div className="space-y-5">
      <fieldset>
        <legend className="label-caps mb-1.5">Severity</legend>
        {SEVERITIES.map((s) => (
          <Checkbox
            key={s}
            checked={filters.severity.includes(s)}
            onCheckedChange={(v) =>
              update({
                severity: v ? [...filters.severity, s] : filters.severity.filter((x) => x !== s),
              })
            }
            label={
              <span className="flex items-center gap-2">
                <SeverityBadge severity={s} />
                {SEVERITY_FULL[s]}
              </span>
            }
            count={repo.analysis?.findingSummary?.bySeverity[s]}
          />
        ))}
      </fieldset>
      <fieldset>
        <legend className="label-caps mb-1.5">Category</legend>
        {CATEGORIES.map((c) => (
          <Checkbox
            key={c}
            checked={filters.category.includes(c)}
            onCheckedChange={(v) =>
              update({
                category: v ? [...filters.category, c] : filters.category.filter((x) => x !== c),
              })
            }
            label={CATEGORY_LABELS[c]}
            count={repo.analysis?.findingSummary?.byCategory[c]}
          />
        ))}
      </fieldset>
      <div>
        <label htmlFor="path-filter" className="label-caps mb-1.5 block">
          Path prefix
        </label>
        <Input
          id="path-filter"
          defaultValue={filters.path}
          placeholder="src/components"
          className="font-mono text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter") update({ path: (e.target as HTMLInputElement).value });
          }}
          onBlur={(e) => {
            if (e.target.value !== filters.path) update({ path: e.target.value });
          }}
        />
      </div>
      {first.data?.rules.length ? (
        <div>
          <label htmlFor="rule-filter" className="label-caps mb-1.5 block">
            Rule
          </label>
          <NativeSelect
            id="rule-filter"
            value={filters.ruleId}
            onChange={(e) => update({ rule: e.target.value })}
            className="w-full font-mono text-xs"
          >
            <option value="">All rules</option>
            {first.data.rules.map((r) => (
              <option key={r.ruleId} value={r.ruleId}>
                {r.ruleId} ({r.count})
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}
      {activeCount > 0 ? (
        <Button size="sm" variant="ghost" onClick={clearAll}>
          <X /> Clear filters
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
      <aside className="hidden lg:block" aria-label="Filters">
        {filterRail}
      </aside>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search
              className="pointer-events-none absolute left-2.5 top-2 size-4 text-fg-subtle"
              aria-hidden
            />
            <Input
              ref={searchRef}
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search title, message, file or rule…"
              className="pl-8 pr-8"
              aria-label="Search findings"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQInput("");
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
            <Kbd className="absolute right-2 top-1.5 hidden sm:inline-flex">/</Kbd>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="md" className="lg:hidden">
                <Filter /> Filters{activeCount ? ` (${activeCount})` : ""}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">{filterRail}</PopoverContent>
          </Popover>
          <NativeSelect
            value={filters.sort}
            onChange={(e) => update({ sort: e.target.value })}
            aria-label="Sort findings"
          >
            <option value="severity">Sort: severity</option>
            <option value="file">Sort: file</option>
            <option value="rule">Sort: rule</option>
          </NativeSelect>
          <span className="ml-auto tabular text-xs text-fg-muted">
            {first.data
              ? `${fmt(first.data.total)} finding${first.data.total === 1 ? "" : "s"}`
              : ""}
          </span>
        </div>

        {activeCount > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            {filters.severity.map((s) => (
              <Chip
                key={s}
                onRemove={() => update({ severity: filters.severity.filter((x) => x !== s) })}
              >
                {SEVERITY_FULL[s]}
              </Chip>
            ))}
            {filters.category.map((c) => (
              <Chip
                key={c}
                onRemove={() => update({ category: filters.category.filter((x) => x !== c) })}
              >
                {CATEGORY_LABELS[c]}
              </Chip>
            ))}
            {filters.path ? (
              <Chip onRemove={() => update({ path: null })}>path: {filters.path}</Chip>
            ) : null}
            {filters.ruleId ? (
              <Chip onRemove={() => update({ rule: null })}>rule: {filters.ruleId}</Chip>
            ) : null}
            {filters.q ? (
              <Chip
                onRemove={() => {
                  setQInput("");
                  update({ q: null });
                }}
              >
                “{filters.q}”
              </Chip>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 overflow-hidden rounded-md border border-border bg-surface">
          {first.isPending ? (
            <div className="space-y-px p-3">
              {Array.from({ length: 10 }, (_, i) => (
                <Skeleton key={`fr-${i.toString()}`} className="h-9" />
              ))}
            </div>
          ) : first.isError ? (
            <div className="p-4">
              <ErrorState error={first.error} onRetry={() => first.refetch()} />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              className="border-0"
              title={activeCount ? "No findings match these filters" : "No findings"}
              description={
                activeCount
                  ? "Try removing a filter."
                  : "The analyzers did not report anything for this commit."
              }
              action={activeCount ? <Button onClick={clearAll}>Clear filters</Button> : null}
            />
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th className="w-16">Sev</Th>
                  <Th>Finding</Th>
                  <Th className="hidden md:table-cell">Rule</Th>
                  <Th className="hidden sm:table-cell">File</Th>
                </tr>
              </THead>
              <TBody>
                {rows.map((f, i) => (
                  <Tr
                    key={f.id}
                    id={`finding-row-${i}`}
                    interactive
                    selected={f.id === selectedId}
                    className={cn(
                      i === cursorIdx && "outline outline-1 -outline-offset-1 outline-ring",
                    )}
                    onClick={() => update({ finding: f.id })}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") update({ finding: f.id });
                    }}
                    aria-selected={f.id === selectedId}
                  >
                    <Td>
                      <SeverityBadge severity={f.severity} />
                    </Td>
                    <Td className="max-w-[420px]">
                      <span className="block truncate">{f.title}</span>
                      <span className="block truncate font-mono text-2xs text-fg-subtle sm:hidden">
                        {f.filePath ?? f.ruleId}
                      </span>
                    </Td>
                    <Td mono className="hidden text-fg-muted md:table-cell">
                      {f.ruleId}
                    </Td>
                    <Td
                      mono
                      className="hidden max-w-[320px] text-fg-muted sm:table-cell"
                      title={f.filePath ?? undefined}
                    >
                      {f.filePath
                        ? `${truncateMiddle(f.filePath, 44)}${f.line ? `:${f.line}` : ""}`
                        : "–"}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </div>
        {nextCursor ? (
          <div className="mt-3 flex justify-center">
            <Button onClick={() => setPages((p) => [...p, nextCursor])} loading={more.isFetching}>
              Load more
            </Button>
          </div>
        ) : null}
        <p className="mt-3 hidden text-2xs text-fg-subtle lg:block">
          <Kbd>j</Kbd> <Kbd>k</Kbd> move · <Kbd>Enter</Kbd> open · <Kbd>/</Kbd> search ·{" "}
          <Kbd>Esc</Kbd> close
        </p>
      </div>

      <Dialog
        open={Boolean(selectedId)}
        onOpenChange={(o) => {
          if (!o) update({ finding: null });
        }}
      >
        {selectedId ? (
          <SheetContent
            title="Finding"
            description={
              <Link href={`${pathname}?${sp.toString()}`} className="font-mono">
                {selectedId.slice(0, 8)}
              </Link>
            }
          >
            <FindingDetailPanel
              analysisId={repo.analysis.id}
              findingId={selectedId}
              onSelect={(id) => update({ finding: id })}
            />
          </SheetContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-sm border border-border bg-surface-2 pl-2 pr-1 text-fg">
      {children}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-sm p-0.5 text-fg-subtle hover:bg-surface-3 hover:text-fg"
        aria-label="Remove filter"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}
