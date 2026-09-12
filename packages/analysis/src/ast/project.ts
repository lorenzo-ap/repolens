import { readFileSync } from "node:fs";
import { LIMITS } from "@repolens/shared";
import { Project, ScriptKind, ScriptTarget, ts } from "ts-morph";
import type { RepoFile } from "../types";

export interface ProjectBuild {
  project: Project;
  parsedFiles: number;
  skippedLargeFiles: number;
}

function scriptKindFor(ext: string): ScriptKind {
  switch (ext) {
    case "tsx":
      return ScriptKind.TSX;
    case "jsx":
      return ScriptKind.JSX;
    case "js":
    case "mjs":
    case "cjs":
      return ScriptKind.JS;
    default:
      return ScriptKind.TS;
  }
}

/**
 * Builds an in-memory ts-morph project from the enumerated source files. We deliberately do not
 * load the repository's tsconfig into the compiler (it could reference arbitrary paths), do not
 * resolve module dependencies through node_modules, and skip files above the AST size limit.
 * Source text is read from disk once and handed to the in-memory file system, so nothing in the
 * repository is ever executed or `require`d.
 */
export function buildProject(
  files: RepoFile[],
  maxAstFileBytes = LIMITS.maxAstFileBytes,
): ProjectBuild {
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    skipLoadingLibFiles: true,
    compilerOptions: {
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.Preserve,
      target: ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      noResolve: true,
      isolatedModules: true,
      allowArbitraryExtensions: true,
    },
  });
  let parsedFiles = 0;
  let skippedLargeFiles = 0;
  for (const file of files) {
    if (!file.isSource) continue;
    if (file.size > maxAstFileBytes) {
      skippedLargeFiles++;
      continue;
    }
    let text: string;
    try {
      text = readFileSync(file.absolutePath, "utf8");
    } catch {
      continue;
    }
    project.createSourceFile(`/${file.path}`, text, {
      overwrite: true,
      scriptKind: scriptKindFor(file.ext),
    });
    parsedFiles++;
  }
  return { project, parsedFiles, skippedLargeFiles };
}

/** Converts the in-memory absolute path back to the repository-relative path. */
export function repoPathOf(sourceFilePath: string): string {
  return sourceFilePath.startsWith("/") ? sourceFilePath.slice(1) : sourceFilePath;
}
