import type { DependenciesMetrics } from "@repolens/shared";
import semver from "semver";
import type { ResolvedPackage } from "./lockfiles";

export type VulnerabilitySummary = NonNullable<DependenciesMetrics["vulnerabilities"]>;

interface Advisory {
  id: number;
  url: string;
  title: string;
  severity: string;
  vulnerable_versions: string;
}

const BULK_ENDPOINT = "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk";
const MAX_PACKAGES = 4000;

/**
 * Queries npm's bulk advisory endpoint with the lockfile-resolved package versions. Nothing is
 * installed. Returns null when the network is unavailable or the request fails, so callers show
 * "not checked" instead of a misleading zero.
 */
export async function fetchAdvisories(
  packages: ResolvedPackage[],
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
  timeoutMs = 15_000,
): Promise<VulnerabilitySummary | null> {
  const byName = new Map<string, Set<string>>();
  for (const p of packages.slice(0, MAX_PACKAGES)) {
    if (!semver.valid(p.version)) continue;
    const s = byName.get(p.name) ?? new Set<string>();
    s.add(p.version);
    byName.set(p.name, s);
  }
  if (byName.size === 0) {
    return {
      checkedAt: new Date().toISOString(),
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
      advisories: [],
    };
  }
  const body: Record<string, string[]> = {};
  for (const [name, versions] of byName) body[name] = [...versions];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetchImpl(BULK_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": "repolens",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, Advisory[]>;
    const summary: VulnerabilitySummary = {
      checkedAt: new Date().toISOString(),
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
      advisories: [],
    };
    for (const [name, advisories] of Object.entries(json)) {
      const versions = byName.get(name);
      if (!versions) continue;
      for (const adv of advisories) {
        for (const version of versions) {
          if (!semver.satisfies(version, adv.vulnerable_versions, { includePrerelease: true }))
            continue;
          const sev = adv.severity.toLowerCase();
          if (sev === "critical") summary.critical++;
          else if (sev === "high") summary.high++;
          else if (sev === "moderate") summary.moderate++;
          else summary.low++;
          summary.advisories.push({
            package: name,
            version,
            severity: sev,
            title: adv.title,
            url: adv.url,
            vulnerableRange: adv.vulnerable_versions,
          });
        }
      }
    }
    const rank: Record<string, number> = { critical: 0, high: 1, moderate: 2, low: 3 };
    summary.advisories.sort(
      (a, b) =>
        (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9) || a.package.localeCompare(b.package),
    );
    summary.advisories = summary.advisories.slice(0, 100);
    return summary;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
