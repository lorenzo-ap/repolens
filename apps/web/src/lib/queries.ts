"use client";

import type { AnalysisDetail } from "@repolens/shared";
import { isActiveStatus } from "@repolens/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type FindingsParams } from "./api";

export const keys = {
  me: ["me"] as const,
  demo: ["demo"] as const,
  githubRepos: (page: number, q: string) => ["github-repos", page, q] as const,
  ownRepositories: ["own-repositories"] as const,
  repository: (owner: string, name: string) => ["repository", owner, name] as const,
  analyses: (owner: string, name: string) => ["analyses", owner, name] as const,
  analysis: (id: string) => ["analysis", id] as const,
  metrics: (id: string) => ["metrics", id] as const,
  history: (id: string) => ["history", id] as const,
  findings: (id: string, params: FindingsParams) => ["findings", id, params] as const,
  finding: (id: string, findingId: string) => ["finding", id, findingId] as const,
  architecture: (id: string, level: string, root?: string) =>
    ["architecture", id, level, root ?? ""] as const,
  compare: (id: string, otherId: string) => ["compare", id, otherId] as const,
};

const IMMUTABLE = { staleTime: Number.POSITIVE_INFINITY, gcTime: 30 * 60_000 };

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => api.me(), staleTime: 5 * 60_000 });
}

export function useDemo() {
  return useQuery({ queryKey: keys.demo, queryFn: () => api.demo(), staleTime: 5 * 60_000 });
}

export function useGitHubRepos(page: number, q: string) {
  return useQuery({
    queryKey: keys.githubRepos(page, q),
    queryFn: () => api.githubRepos(page, q || undefined),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function useOwnRepositories(enabled: boolean) {
  return useQuery({
    queryKey: keys.ownRepositories,
    queryFn: () => api.ownRepositories(),
    enabled,
    staleTime: 30_000,
  });
}

export function useRepository(owner: string, name: string) {
  return useQuery({
    queryKey: keys.repository(owner, name),
    queryFn: () => api.repository(owner, name),
    staleTime: 15_000,
    refetchInterval: (query) => (query.state.data?.activeAnalysis ? 3000 : false),
  });
}

export function useAnalyses(owner: string, name: string) {
  return useQuery({
    queryKey: keys.analyses(owner, name),
    queryFn: () => api.analyses(owner, name),
    staleTime: 15_000,
  });
}

export function useAnalysis(id: string | null) {
  return useQuery({
    queryKey: keys.analysis(id ?? ""),
    queryFn: () => api.analysis(id as string),
    enabled: Boolean(id),
    staleTime: (query) =>
      query.state.data && !isActiveStatus(query.state.data.analysis.status)
        ? Number.POSITIVE_INFINITY
        : 0,
    refetchInterval: (query) =>
      query.state.data && isActiveStatus(query.state.data.analysis.status) ? 1500 : false,
  });
}

export function useMetrics(id: string | null) {
  return useQuery({
    queryKey: keys.metrics(id ?? ""),
    queryFn: () => api.metrics(id as string),
    enabled: Boolean(id),
    ...IMMUTABLE,
  });
}

export function useHistory(id: string | null) {
  return useQuery({
    queryKey: keys.history(id ?? ""),
    queryFn: () => api.history(id as string),
    enabled: Boolean(id),
    ...IMMUTABLE,
  });
}

export function useFindings(id: string | null, params: FindingsParams) {
  return useQuery({
    queryKey: keys.findings(id ?? "", params),
    queryFn: () => api.findings(id as string, params),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
    ...IMMUTABLE,
  });
}

export function useFinding(id: string | null, findingId: string | null) {
  return useQuery({
    queryKey: keys.finding(id ?? "", findingId ?? ""),
    queryFn: () => api.finding(id as string, findingId as string),
    enabled: Boolean(id && findingId),
    staleTime: 60_000,
  });
}

export function useArchitecture(id: string | null, level: "dir" | "file", root?: string) {
  return useQuery({
    queryKey: keys.architecture(id ?? "", level, root),
    queryFn: () => api.architecture(id as string, level, root),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
    ...IMMUTABLE,
  });
}

export function useCompare(id: string | null, otherId: string | null) {
  return useQuery({
    queryKey: keys.compare(id ?? "", otherId ?? ""),
    queryFn: () => api.compare(id as string, otherId as string),
    enabled: Boolean(id && otherId && id !== otherId),
    ...IMMUTABLE,
  });
}

export function useStartAnalysis(owner: string, name: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.startAnalysis(owner, name),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: keys.repository(owner, name) }),
        qc.invalidateQueries({ queryKey: keys.analyses(owner, name) }),
        qc.invalidateQueries({ queryKey: keys.githubRepos(1, "") }),
      ]);
    },
  });
}

export function useAddRepository() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ owner, name }: { owner: string; name: string }) =>
      api.addRepository(owner, name),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["github-repos"] });
      await qc.invalidateQueries({ queryKey: keys.ownRepositories });
    },
  });
}

export function useDeleteRepository() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ owner, name }: { owner: string; name: string }) =>
      api.deleteRepository(owner, name),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["github-repos"] });
      await qc.invalidateQueries({ queryKey: keys.ownRepositories });
    },
  });
}

export function useCreateIssue(analysisId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (findingId: string) => api.createIssue(analysisId, findingId),
    onSuccess: async (_data, findingId) => {
      await qc.invalidateQueries({ queryKey: keys.finding(analysisId, findingId) });
      await qc.invalidateQueries({ queryKey: ["findings", analysisId] });
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: async () => {
      qc.clear();
      window.location.assign("/");
    },
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteAccount(),
    onSuccess: async () => {
      qc.clear();
      window.location.assign("/?account=deleted");
    },
  });
}

export function useCancelAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.cancelAnalysis(id),
    onSuccess: async (_d, id) => {
      await qc.invalidateQueries({ queryKey: keys.analysis(id) });
      await qc.invalidateQueries({ queryKey: ["repository"] });
    },
  });
}

export type { AnalysisDetail };
