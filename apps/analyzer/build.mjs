import { bundle } from "@repolens/config/esbuild-node.mjs";

await bundle({
  entryPoints: ["src/main.ts", "src/serve.ts", "src/seed-demo.ts", "src/migrate.ts"],
  outdir: "dist",
});
