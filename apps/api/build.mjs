import { bundle } from "@repolens/config/esbuild-node.mjs";

await bundle({ entryPoints: ["src/main.ts"], outdir: "dist" });
