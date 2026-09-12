"use client";

import type { AnalysisSummary, Repository } from "@repolens/shared";
import { createContext, useContext } from "react";

export interface RepoContextValue {
  owner: string;
  name: string;
  repository: Repository;
  /** Analysis being viewed: the latest completed one unless `?analysis=` selects another. */
  analysis: AnalysisSummary | null;
  analyses: AnalysisSummary[];
  latestCompleted: AnalysisSummary | null;
  active: AnalysisSummary | null;
  isLatest: boolean;
  /** Query string that keeps the selected analysis when navigating between tabs. */
  preserveQuery: string;
}

export const RepoContext = createContext<RepoContextValue | null>(null);

export function useRepo(): RepoContextValue {
  const ctx = useContext(RepoContext);
  if (!ctx) throw new Error("useRepo must be used inside the repository shell");
  return ctx;
}
