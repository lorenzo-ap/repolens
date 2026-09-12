"use client";

import type { AnalysisSummary, Repository } from "@repolens/shared";
import { createContext, useContext } from "react";
import { withQuery } from "@/lib/utils";

export interface RepoContextValue {
  owner: string;
  name: string;
  /** `/r/owner/name` */
  base: string;
  repository: Repository;
  /** Analysis being viewed: the latest completed one unless `?analysis=` selects another. */
  analysis: AnalysisSummary | null;
  /** The completed analysis before the viewed one, when there is one. */
  previous: AnalysisSummary | null;
  analyses: AnalysisSummary[];
  latestCompleted: AnalysisSummary | null;
  active: AnalysisSummary | null;
  isLatest: boolean;
  /** Query string (without `?`) that keeps the selected analysis when navigating between pages. */
  preserveQuery: string;
  /** Builds a link within this repository that keeps the selected analysis. */
  href: (path: string, query?: string) => string;
}

export const RepoContext = createContext<RepoContextValue | null>(null);

export function useRepo(): RepoContextValue {
  const ctx = useContext(RepoContext);
  if (!ctx) throw new Error("useRepo must be used inside the repository shell");
  return ctx;
}

export function buildHref(base: string, preserveQuery: string) {
  return (path: string, query?: string) => {
    const p = path ? `${base}/${path.replace(/^\//, "")}` : base;
    return withQuery(withQuery(p, query ?? ""), preserveQuery);
  };
}
