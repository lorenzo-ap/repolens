// Shared production bundler for the Node services. Only packages declared as runtime dependencies
// of the app stay external (resolved from node_modules); everything else, including the
// TypeScript-source workspace packages, is inlined so the bundle is self-contained.
import { readFileSync } from "node:fs";
import { build } from "esbuild";

export async function bundle({ entryPoints, outdir }) {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const externals = new Set(
    Object.keys(pkg.dependencies ?? {}).filter((name) => !name.startsWith("@repolens/")),
  );
  await build({
    entryPoints,
    outdir,
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    sourcemap: true,
    logLevel: "info",
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
    plugins: [
      {
        name: "external-app-dependencies",
        setup(b) {
          b.onResolve({ filter: /^[^./]/ }, (args) => {
            if (args.path.startsWith("node:")) return { path: args.path, external: true };
            const name = args.path.startsWith("@")
              ? args.path.split("/").slice(0, 2).join("/")
              : (args.path.split("/")[0] ?? args.path);
            return externals.has(name) ? { path: args.path, external: true } : null;
          });
        },
      },
    ],
  });
}
