import type * as React from "react";
import { cn } from "@/lib/utils";

const KEYWORDS = new Set([
  "abstract",
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "of",
  "package",
  "private",
  "protected",
  "public",
  "readonly",
  "return",
  "satisfies",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "type",
  "typeof",
  "undefined",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "declare",
  "namespace",
  "keyof",
  "infer",
  "is",
  "override",
]);

const TYPES = new Set([
  "string",
  "number",
  "boolean",
  "any",
  "unknown",
  "never",
  "object",
  "symbol",
  "bigint",
  "Promise",
  "Array",
  "Record",
  "Partial",
  "Required",
  "Readonly",
  "Pick",
  "Omit",
  "Map",
  "Set",
  "Error",
  "Date",
  "RegExp",
  "Response",
  "Request",
]);

type Token = { cls: string | null; text: string };

/**
 * Small tokenizer good enough for JavaScript/TypeScript snippets: comments, strings, template
 * literals, numbers, keywords, common types, call names and punctuation. No dependency, no
 * runtime evaluation, deterministic.
 */
export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  const re =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?\b|\b0x[\da-f]+\b)|([A-Za-z_$][\w$]*)|([{}()[\];,.<>=+\-*/%!&|?:^~@#])|(\s+)|(.)/gi;
  let m: RegExpExecArray | null = re.exec(src);
  while (m !== null) {
    const [text, comment, str, num, ident, punct] = m;
    if (comment) out.push({ cls: "tok-cm", text });
    else if (str) out.push({ cls: "tok-str", text });
    else if (num) out.push({ cls: "tok-num", text });
    else if (ident) {
      const next = src.slice(re.lastIndex).match(/^\s*\(/);
      if (KEYWORDS.has(ident)) out.push({ cls: "tok-kw", text });
      else if (TYPES.has(ident) || /^[A-Z][A-Za-z0-9]*$/.test(ident))
        out.push({ cls: "tok-ty", text });
      else if (next) out.push({ cls: "tok-fn", text });
      else out.push({ cls: null, text });
    } else if (punct) out.push({ cls: "tok-pn", text });
    else out.push({ cls: null, text });
    m = re.exec(src);
  }
  return out;
}

function Highlighted({ line }: { line: string }) {
  return (
    <>
      {tokenize(line).map((t, i) =>
        t.cls ? (
          <span key={`${i.toString()}-${t.text.slice(0, 4)}`} className={t.cls}>
            {t.text}
          </span>
        ) : (
          <span key={`${i.toString()}-${t.text.slice(0, 4)}`}>{t.text}</span>
        ),
      )}
    </>
  );
}

export function CodeBlock({
  code,
  startLine,
  highlightLine,
  title,
  className,
}: {
  code: string;
  startLine?: number;
  highlightLine?: number | null;
  title?: React.ReactNode;
  className?: string;
}) {
  const lines = code.replace(/\n$/, "").split("\n");
  const base = startLine ?? 1;
  const width = String(base + lines.length).length;
  return (
    <figure
      className={cn("overflow-hidden rounded-md border border-border bg-bg-subtle", className)}
    >
      {title ? (
        <figcaption className="flex h-8 items-center border-b border-border px-3 font-mono text-2xs text-fg-tertiary">
          {title}
        </figcaption>
      ) : null}
      <pre className="scrollbar-thin overflow-x-auto py-2 font-mono text-xs leading-[18px] text-fg">
        {lines.map((line, i) => {
          const n = base + i;
          const hl = highlightLine === n;
          return (
            <div
              key={`${n}-${line.slice(0, 8)}`}
              className={cn("flex px-3", hl && "bg-medium-subtle")}
            >
              <span
                className={cn("select-none pr-4 text-right text-fg-tertiary", hl && "text-medium")}
                style={{ minWidth: `${width + 1}ch` }}
                aria-hidden
              >
                {n}
              </span>
              <span className="whitespace-pre">{line ? <Highlighted line={line} /> : " "}</span>
            </div>
          );
        })}
      </pre>
    </figure>
  );
}

export function InlineCode({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <code
      className={cn(
        "rounded-xs border border-border bg-bg-muted px-1 py-px font-mono text-[0.92em] text-fg",
        className,
      )}
    >
      {children}
    </code>
  );
}

/** A repository path, rendered in monospace with the file name emphasised. */
export function FilePath({
  path,
  line,
  className,
}: {
  path: string;
  line?: number | null;
  className?: string;
}) {
  const i = path.lastIndexOf("/");
  const dir = i === -1 ? "" : path.slice(0, i + 1);
  const file = i === -1 ? path : path.slice(i + 1);
  return (
    <span
      className={cn("truncate font-mono text-xs", className)}
      title={line ? `${path}:${line}` : path}
    >
      <span className="text-fg-tertiary">{dir}</span>
      <span className="text-fg">{file}</span>
      {line ? <span className="text-fg-tertiary">:{line}</span> : null}
    </span>
  );
}
