const EXTENSION_LANGUAGE: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  mts: "TypeScript",
  cts: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  vue: "Vue",
  svelte: "Svelte",
  astro: "Astro",
  json: "JSON",
  jsonc: "JSON",
  json5: "JSON",
  yml: "YAML",
  yaml: "YAML",
  toml: "TOML",
  md: "Markdown",
  mdx: "Markdown",
  css: "CSS",
  scss: "SCSS",
  sass: "SCSS",
  less: "Less",
  html: "HTML",
  htm: "HTML",
  svg: "SVG",
  sh: "Shell",
  bash: "Shell",
  zsh: "Shell",
  py: "Python",
  rb: "Ruby",
  go: "Go",
  rs: "Rust",
  java: "Java",
  kt: "Kotlin",
  swift: "Swift",
  c: "C",
  h: "C",
  cpp: "C++",
  cc: "C++",
  hpp: "C++",
  cs: "C#",
  php: "PHP",
  sql: "SQL",
  graphql: "GraphQL",
  gql: "GraphQL",
  proto: "Protobuf",
  prisma: "Prisma",
  txt: "Text",
  env: "Text",
  xml: "XML",
  csv: "CSV",
  dockerfile: "Dockerfile",
  tf: "Terraform",
  hcl: "Terraform",
};

const BINARY_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "ico",
  "bmp",
  "tiff",
  "pdf",
  "zip",
  "gz",
  "tgz",
  "bz2",
  "xz",
  "7z",
  "rar",
  "tar",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  "mp3",
  "mp4",
  "wav",
  "ogg",
  "webm",
  "mov",
  "avi",
  "exe",
  "dll",
  "so",
  "dylib",
  "wasm",
  "class",
  "jar",
  "pyc",
  "o",
  "a",
  "bin",
  "dat",
  "db",
  "sqlite",
  "lockb",
  "node",
]);

const SPECIAL_FILENAMES: Record<string, string> = {
  dockerfile: "Dockerfile",
  makefile: "Makefile",
  license: "Text",
  readme: "Markdown",
  ".gitignore": "Text",
  ".npmrc": "Text",
  ".editorconfig": "Text",
};

export function extensionOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function languageFor(path: string): string | null {
  const base = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const special = SPECIAL_FILENAMES[base] ?? SPECIAL_FILENAMES[base.split(".")[0] ?? ""];
  const ext = extensionOf(path);
  if (ext === "" && special) return special;
  if (BINARY_EXTENSIONS.has(ext)) return null;
  return EXTENSION_LANGUAGE[ext] ?? special ?? "Other";
}

export function isBinaryExtension(ext: string): boolean {
  return BINARY_EXTENSIONS.has(ext);
}

const SOURCE_EXTENSIONS = new Set(["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"]);

export function isSourceExtension(ext: string): boolean {
  return SOURCE_EXTENSIONS.has(ext);
}

export function isTypeScriptExtension(ext: string): boolean {
  return ext === "ts" || ext === "tsx" || ext === "mts" || ext === "cts";
}

export function isDeclarationFile(path: string): boolean {
  return /\.d\.(c|m)?ts$/.test(path);
}

const TEST_PATH_RE =
  /(^|\/)(__tests__|__mocks__|tests?|e2e|spec|cypress|playwright)\/|\.(test|spec|e2e|cy|stories)\.[cm]?[jt]sx?$|(^|\/)(vitest|jest|playwright|cypress)\.(config|setup)\.[cm]?[jt]s$/i;

export function isTestPath(path: string): boolean {
  return TEST_PATH_RE.test(path);
}

export function isMinified(path: string): boolean {
  return /\.min\.(js|css)$/i.test(path);
}

/** Directories that hold supporting code (benchmarks, examples, docs) rather than the product itself. */
const AUXILIARY_DIR_RE =
  /^(benchmarks?|bench|examples?|docs?|scripts?|tools?|fixtures?|deno_dist|perf-measures|playgrounds?|sandbox|demos?|samples?|website|\.github|\.storybook)(\/|$)/i;

export function isAuxiliaryPath(path: string): boolean {
  return AUXILIARY_DIR_RE.test(path);
}

export function isGeneratedPath(path: string): boolean {
  return /(^|\/)(generated|__generated__|\.generated)\//i.test(path) || /\.generated\./i.test(path);
}
