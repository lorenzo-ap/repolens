import { cn } from "@/lib/utils";

export function CodeBlock({
  code,
  startLine,
  highlightLine,
  className,
}: {
  code: string;
  startLine?: number;
  highlightLine?: number | null;
  className?: string;
}) {
  const lines = code.replace(/\n$/, "").split("\n");
  const base = startLine ?? 1;
  const width = String(base + lines.length).length;
  return (
    <pre
      className={cn(
        "scrollbar-thin overflow-x-auto rounded-md border border-border bg-surface-2 py-2 font-mono text-xs leading-[18px] text-fg",
        className,
      )}
    >
      {lines.map((line, i) => {
        const n = base + i;
        const hl = highlightLine === n;
        return (
          <div key={`${n}-${line.slice(0, 8)}`} className={cn("flex px-3", hl && "bg-medium-bg")}>
            <span
              className="select-none pr-3 text-right text-fg-subtle"
              style={{ minWidth: `${width + 1}ch` }}
              aria-hidden
            >
              {n}
            </span>
            <span className="whitespace-pre">{line || " "}</span>
          </div>
        );
      })}
    </pre>
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
        "rounded-sm border border-border bg-surface-2 px-1 py-px font-mono text-[0.92em] text-fg",
        className,
      )}
    >
      {children}
    </code>
  );
}
