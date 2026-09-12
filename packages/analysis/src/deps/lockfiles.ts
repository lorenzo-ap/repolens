import { parse as parseYarnV1 } from "@yarnpkg/lockfile";
import { parse as parseYaml } from "yaml";

export type LockfileType = "pnpm" | "npm" | "yarn" | "bun" | "none";

export interface ResolvedPackage {
  name: string;
  version: string;
}

export interface LockfileInfo {
  type: LockfileType;
  packages: ResolvedPackage[];
}

const LOCKFILE_NAMES: Array<{ file: string; type: LockfileType }> = [
  { file: "pnpm-lock.yaml", type: "pnpm" },
  { file: "package-lock.json", type: "npm" },
  { file: "yarn.lock", type: "yarn" },
  { file: "bun.lock", type: "bun" },
];

export function detectLockfile(paths: Set<string>): { file: string; type: LockfileType } | null {
  for (const c of LOCKFILE_NAMES) if (paths.has(c.file)) return c;
  if (paths.has("bun.lockb")) return { file: "bun.lockb", type: "bun" };
  return null;
}

/** Splits `name@version` where the name may itself contain an `@` scope. */
function splitNameVersion(spec: string): ResolvedPackage | null {
  const at = spec.lastIndexOf("@");
  if (at <= 0) return null;
  const name = spec.slice(0, at);
  const version = spec.slice(at + 1);
  if (!name || !version) return null;
  return { name, version: version.split("(")[0] ?? version };
}

export function parsePnpmLock(text: string): ResolvedPackage[] {
  const doc = parseYaml(text) as {
    packages?: Record<string, unknown>;
    lockfileVersion?: string | number;
  } | null;
  if (!doc?.packages) return [];
  const out: ResolvedPackage[] = [];
  for (const key of Object.keys(doc.packages)) {
    // v9: "name@version" or "@scope/name@version(peer@x)"; v6: "/name@version"; v5: "/name/version".
    let k = key.startsWith("/") ? key.slice(1) : key;
    k = k.split("(")[0] ?? k;
    let pkg = splitNameVersion(k);
    if (!pkg && k.includes("/")) {
      const i = k.lastIndexOf("/");
      pkg = { name: k.slice(0, i), version: k.slice(i + 1) };
    }
    if (pkg) out.push(pkg);
  }
  return out;
}

export function parseNpmLock(text: string): ResolvedPackage[] {
  const doc = JSON.parse(text) as {
    lockfileVersion?: number;
    packages?: Record<string, { version?: string; name?: string; link?: boolean }>;
    dependencies?: Record<string, { version?: string; dependencies?: unknown }>;
  };
  const out: ResolvedPackage[] = [];
  if (doc.packages) {
    for (const [key, val] of Object.entries(doc.packages)) {
      if (key === "" || val.link || !val.version) continue;
      const idx = key.lastIndexOf("node_modules/");
      if (idx === -1) continue; // workspace package
      out.push({ name: val.name ?? key.slice(idx + "node_modules/".length), version: val.version });
    }
    return out;
  }
  const walk = (deps: Record<string, { version?: string; dependencies?: unknown }> | undefined) => {
    for (const [name, val] of Object.entries(deps ?? {})) {
      if (val.version) out.push({ name, version: val.version });
      walk(
        val.dependencies as
          | Record<string, { version?: string; dependencies?: unknown }>
          | undefined,
      );
    }
  };
  walk(doc.dependencies);
  return out;
}

export function parseYarnLock(text: string): ResolvedPackage[] {
  const out: ResolvedPackage[] = [];
  if (text.includes("__metadata:")) {
    // Yarn berry: YAML with keys like "name@npm:^1.0.0, name@npm:^1.2.0".
    const doc = parseYaml(text) as Record<string, { version?: string; resolution?: string }>;
    for (const [key, val] of Object.entries(doc)) {
      if (key === "__metadata" || !val?.version) continue;
      const first = key.split(",")[0]?.trim() ?? key;
      const at = first.indexOf("@", 1);
      const name = at === -1 ? first : first.slice(0, at);
      if (val.resolution?.includes("@workspace:")) continue;
      out.push({ name, version: val.version });
    }
    return out;
  }
  const parsed = parseYarnV1(text);
  if (parsed.type !== "success") return out;
  const seen = new Set<string>();
  for (const [key, val] of Object.entries(parsed.object as Record<string, { version: string }>)) {
    const at = key.indexOf("@", 1);
    const name = at === -1 ? key : key.slice(0, at);
    const id = `${name}@${val.version}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ name, version: val.version });
  }
  return out;
}

export function parseBunLock(text: string): ResolvedPackage[] {
  // bun.lock is JSONC; strip comments and trailing commas conservatively.
  const cleaned = text.replace(/\/\/.*$/gm, "").replace(/,\s*([}\]])/g, "$1");
  try {
    const doc = JSON.parse(cleaned) as { packages?: Record<string, unknown[]> };
    const out: ResolvedPackage[] = [];
    for (const [, val] of Object.entries(doc.packages ?? {})) {
      const spec = val?.[0];
      if (typeof spec !== "string") continue;
      const pkg = splitNameVersion(spec);
      if (pkg) out.push(pkg);
    }
    return out;
  } catch {
    return [];
  }
}

export function parseLockfile(type: LockfileType, text: string): ResolvedPackage[] {
  try {
    switch (type) {
      case "pnpm":
        return parsePnpmLock(text);
      case "npm":
        return parseNpmLock(text);
      case "yarn":
        return parseYarnLock(text);
      case "bun":
        return parseBunLock(text);
      default:
        return [];
    }
  } catch {
    return [];
  }
}

export function duplicateVersions(
  packages: ResolvedPackage[],
): Array<{ name: string; versions: string[] }> {
  const byName = new Map<string, Set<string>>();
  for (const p of packages) {
    const s = byName.get(p.name) ?? new Set<string>();
    s.add(p.version);
    byName.set(p.name, s);
  }
  return [...byName.entries()]
    .filter(([, v]) => v.size > 1)
    .map(([name, v]) => ({ name, versions: [...v].sort() }))
    .sort((a, b) => b.versions.length - a.versions.length || a.name.localeCompare(b.name));
}
