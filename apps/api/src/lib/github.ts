import { GitHubApiError } from "./errors";

const API = "https://api.github.com";
const USER_AGENT = "RepoLens/0.1 (+https://github.com/lorenzo-ap/repolens)";

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  description: string | null;
  private: boolean;
  default_branch: string;
  language: string | null;
  size: number;
  pushed_at: string | null;
  html_url: string;
  clone_url: string;
  archived?: boolean;
}

export interface GitHubIssue {
  number: number;
  html_url: string;
}

export interface GitHubClient {
  exchangeCode(
    code: string,
    redirectUri: string,
  ): Promise<{ accessToken: string; scopes: string[] }>;
  getUser(token: string): Promise<GitHubUser>;
  listRepos(
    token: string,
    options: { page: number; perPage: number; query?: string; login: string },
  ): Promise<{ repos: GitHubRepository[]; hasMore: boolean }>;
  getRepo(token: string, owner: string, name: string): Promise<GitHubRepository>;
  createIssue(
    token: string,
    owner: string,
    name: string,
    issue: { title: string; body: string; labels?: string[] },
  ): Promise<GitHubIssue>;
}

interface Options {
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string };
    return body.message ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export function createGitHubClient(options: Options): GitHubClient {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function request<T>(
    token: string | null,
    path: string,
    init: RequestInit = {},
  ): Promise<{ data: T; headers: Headers }> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/vnd.github+json");
    headers.set("x-github-api-version", "2022-11-28");
    headers.set("user-agent", USER_AGENT);
    if (token) headers.set("authorization", `Bearer ${token}`);
    const res = await fetchImpl(path.startsWith("http") ? path : `${API}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const message = await readError(res);
      const remaining = res.headers.get("x-ratelimit-remaining");
      if (res.status === 403 && remaining === "0") {
        const reset = Number(res.headers.get("x-ratelimit-reset") ?? 0) * 1000;
        const mins = reset ? Math.max(1, Math.ceil((reset - Date.now()) / 60_000)) : null;
        throw new GitHubApiError(
          `GitHub rate limit reached${mins ? `; resets in about ${mins} min` : ""}`,
          403,
        );
      }
      throw new GitHubApiError(`GitHub: ${message}`, res.status);
    }
    return { data: (await res.json()) as T, headers: res.headers };
  }

  return {
    async exchangeCode(code, redirectUri) {
      const res = await fetchImpl("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "user-agent": USER_AGENT,
        },
        body: JSON.stringify({
          client_id: options.clientId,
          client_secret: options.clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new GitHubApiError("GitHub OAuth token exchange failed", res.status);
      const body = (await res.json()) as {
        access_token?: string;
        scope?: string;
        error?: string;
        error_description?: string;
      };
      if (!body.access_token)
        throw new GitHubApiError(
          body.error_description ?? body.error ?? "GitHub did not return a token",
          400,
        );
      return {
        accessToken: body.access_token,
        scopes: (body.scope ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
    },

    async getUser(token) {
      return (await request<GitHubUser>(token, "/user")).data;
    },

    async listRepos(token, { page, perPage, query, login }) {
      if (query?.trim()) {
        const q = encodeURIComponent(`${query.trim()} user:${login} fork:true`);
        const { data } = await request<{ items: GitHubRepository[]; total_count: number }>(
          token,
          `/search/repositories?q=${q}&per_page=${perPage}&page=${page}&sort=updated`,
        );
        return { repos: data.items, hasMore: page * perPage < Math.min(data.total_count, 1000) };
      }
      const { data, headers } = await request<GitHubRepository[]>(
        token,
        `/user/repos?sort=pushed&direction=desc&per_page=${perPage}&page=${page}&affiliation=owner,collaborator,organization_member`,
      );
      const link = headers.get("link") ?? "";
      return { repos: data, hasMore: /rel="next"/.test(link) };
    },

    async getRepo(token, owner, name) {
      return (
        await request<GitHubRepository>(
          token,
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
        )
      ).data;
    },

    async createIssue(token, owner, name, issue) {
      const { data } = await request<GitHubIssue>(
        token,
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(issue),
        },
      );
      return data;
    },
  };
}
