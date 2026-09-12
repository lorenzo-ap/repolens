import type {
  AnalysisDetail,
  AnalysisListResponse,
  AnalysisSummary,
  ApiError,
  ArchitectureResponse,
  CompareResponse,
  CreateIssueResponse,
  DemoResponse,
  ErrorCode,
  FindingDetail,
  FindingsPage,
  GitHubReposResponse,
  HistoryResponse,
  MeResponse,
  MetricsResponse,
  RepositoryDetail,
} from "@repolens/shared";

export class ApiClientError extends Error {
  constructor(
    public readonly code: ErrorCode | "network",
    public readonly status: number,
    message: string,
    public readonly requestId?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

function baseUrl(): string {
  if (typeof window !== "undefined") return "";
  return (process.env.API_INTERNAL_URL ?? "http://localhost:4000").replace(/\/$/, "");
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { cookie?: string } = {},
): Promise<T> {
  const { cookie, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set("accept", "application/json");
  if (rest.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/api/v1${path}`, {
      ...rest,
      headers,
      credentials: "same-origin",
    });
  } catch (err) {
    throw new ApiClientError("network", 0, err instanceof Error ? err.message : "Network error");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const err = (body as ApiError | null)?.error;
    throw new ApiClientError(
      err?.code ?? "internal",
      res.status,
      err?.message ?? `Request failed (${res.status})`,
      err?.requestId,
      err?.details,
    );
  }
  return body as T;
}

function qs(params: object): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) for (const item of v) sp.append(k, String(item));
    else sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export interface FindingsParams {
  severity?: string[];
  category?: string[];
  path?: string;
  q?: string;
  ruleId?: string;
  sort?: "severity" | "file" | "rule";
  cursor?: string;
  limit?: number;
}

export const api = {
  me: (cookie?: string) => apiFetch<MeResponse>("/me", { cookie }),
  logout: () => apiFetch<{ ok: true }>("/auth/logout", { method: "POST" }),
  deleteAccount: () => apiFetch<{ ok: true }>("/me", { method: "DELETE" }),
  health: () => apiFetch<{ status: string }>("/health"),
  demo: (cookie?: string) =>
    apiFetch<DemoResponse>("/demo", { cookie, next: { revalidate: 120 } } as RequestInit),
  githubRepos: (page: number, q?: string) =>
    apiFetch<GitHubReposResponse>(`/github/repos${qs({ page, q })}`),
  ownRepositories: () => apiFetch<{ repositories: RepositoryDetail[] }>("/repositories"),
  addRepository: (owner: string, name: string) =>
    apiFetch<RepositoryDetail>("/repositories", {
      method: "POST",
      body: JSON.stringify({ owner, name }),
    }),
  repository: (owner: string, name: string, cookie?: string) =>
    apiFetch<RepositoryDetail>(`/repositories/${enc(owner)}/${enc(name)}`, { cookie }),
  deleteRepository: (owner: string, name: string) =>
    apiFetch<{ ok: true }>(`/repositories/${enc(owner)}/${enc(name)}`, { method: "DELETE" }),
  analyses: (owner: string, name: string, limit = 30) =>
    apiFetch<AnalysisListResponse>(
      `/repositories/${enc(owner)}/${enc(name)}/analyses${qs({ limit })}`,
    ),
  startAnalysis: (owner: string, name: string) =>
    apiFetch<{ analysis: AnalysisSummary; created: boolean }>(
      `/repositories/${enc(owner)}/${enc(name)}/analyses`,
      { method: "POST" },
    ),
  analysis: (id: string) => apiFetch<AnalysisDetail>(`/analyses/${enc(id)}`),
  cancelAnalysis: (id: string) =>
    apiFetch<{ ok: true }>(`/analyses/${enc(id)}/cancel`, { method: "POST" }),
  metrics: (id: string) => apiFetch<MetricsResponse>(`/analyses/${enc(id)}/metrics`),
  history: (id: string) => apiFetch<HistoryResponse>(`/analyses/${enc(id)}/history`),
  findings: (id: string, params: FindingsParams) =>
    apiFetch<FindingsPage>(`/analyses/${enc(id)}/findings${qs(params)}`),
  finding: (id: string, findingId: string) =>
    apiFetch<FindingDetail>(`/analyses/${enc(id)}/findings/${enc(findingId)}`),
  createIssue: (id: string, findingId: string) =>
    apiFetch<CreateIssueResponse>(`/analyses/${enc(id)}/findings/${enc(findingId)}/issue`, {
      method: "POST",
    }),
  architecture: (id: string, level: "dir" | "file", root?: string) =>
    apiFetch<ArchitectureResponse>(`/analyses/${enc(id)}/architecture${qs({ level, root })}`),
  compare: (id: string, otherId: string) =>
    apiFetch<CompareResponse>(`/analyses/${enc(id)}/compare/${enc(otherId)}`),
};

function enc(s: string): string {
  return encodeURIComponent(s);
}
