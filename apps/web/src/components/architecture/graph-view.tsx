"use client";

import dagre from "@dagrejs/dagre";
import type { ArchitectureResponse, ModuleEdge, ModuleNode } from "@repolens/shared";
import {
  Background,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  MiniMap,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from "d3-force";
import { ArrowLeft, Maximize2, Minimize2, Search, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useRepo } from "@/components/repo/context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilePath } from "@/components/ui/code";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Checkbox, Input, SegmentedControl } from "@/components/ui/input";
import { MetricList, MetricRow } from "@/components/ui/metric";
import { PageHeader } from "@/components/ui/page";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Table, TBody, Td, THead, Th, Tr } from "@/components/ui/table";
import { useArchitecture } from "@/lib/queries";
import { useUrlParams } from "@/lib/use-url-params";
import { cn, fmt, truncateMiddle } from "@/lib/utils";

type Layout = "hierarchical" | "force";

interface NodeData extends Record<string, unknown> {
  module: ModuleNode;
  dimmed: boolean;
  matched: boolean;
  maxLoc: number;
}

const NODE_H = 40;
const widthOf = (m: ModuleNode, maxLoc: number) =>
  132 + Math.round((m.loc / Math.max(1, maxLoc)) * 96);

const ModuleNodeView = memo(function ModuleNodeView({ data, selected }: NodeProps<Node<NodeData>>) {
  const { module: m, dimmed, matched, maxLoc } = data;
  const density = m.loc > 0 ? m.findingCount / Math.max(1, m.loc / 100) : 0; // findings per 100 lines
  const heat =
    density >= 3
      ? "border-l-critical"
      : density >= 1
        ? "border-l-high"
        : density > 0
          ? "border-l-medium"
          : "border-l-border-strong";
  const label = m.kind === "dir" ? m.path : m.path.slice(m.path.lastIndexOf("/") + 1);
  return (
    <div
      className={cn(
        "rounded-sm border border-border border-l-[3px] bg-bg px-2.5 py-1.5 font-mono text-xs shadow-sm transition-opacity",
        heat,
        (selected || matched) && "border-fg ring-1 ring-fg",
        dimmed && "opacity-40",
        m.inCycle && "border-dashed",
      )}
      style={{ width: widthOf(m, maxLoc) }}
      title={m.path}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-1.5 !border-0 !bg-border-strong"
      />
      <div className="truncate text-fg">{label}</div>
      <div className="mt-0.5 flex items-center gap-2 text-2xs text-fg-tertiary">
        <span className="tabular">{fmt(m.loc)} loc</span>
        <span className="tabular">
          ↓{m.fanIn} ↑{m.fanOut}
        </span>
        {m.findingCount ? (
          <span className="tabular text-fg-secondary">{m.findingCount} f</span>
        ) : null}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-1.5 !border-0 !bg-border-strong"
      />
    </div>
  );
});

const nodeTypes = { module: ModuleNodeView };

function layoutNodes(
  nodes: ModuleNode[],
  edges: ModuleEdge[],
  layout: Layout,
  maxLoc: number,
): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  if (layout === "hierarchical") {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "TB", nodesep: 20, ranksep: 48, marginx: 16, marginy: 16 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of nodes) g.setNode(n.path, { width: widthOf(n, maxLoc), height: NODE_H });
    for (const e of edges) g.setEdge(e.from, e.to);
    dagre.layout(g);
    for (const n of nodes) {
      const p = g.node(n.path);
      pos.set(n.path, { x: p.x - widthOf(n, maxLoc) / 2, y: p.y - NODE_H / 2 });
    }
    return pos;
  }
  interface SimNode extends SimulationNodeDatum {
    id: string;
    w: number;
    x: number;
    y: number;
  }
  // Deterministic initial placement (no Math.random) so layouts are reproducible.
  const sim: SimNode[] = nodes.map((n, i) => ({
    id: n.path,
    x: 400 + Math.cos(i * 2.399) * (40 + i * 6),
    y: 300 + Math.sin(i * 2.399) * (40 + i * 6),
    w: widthOf(n, maxLoc),
  }));
  const byId = new Map(sim.map((s) => [s.id, s]));
  const links = edges
    .filter((e) => byId.has(e.from) && byId.has(e.to))
    .map((e) => ({ source: e.from, target: e.to }));
  const simulation = forceSimulation(sim)
    .force(
      "link",
      forceLink(links)
        .id((d) => (d as { id: string }).id)
        .distance(110)
        .strength(0.4),
    )
    .force("charge", forceManyBody().strength(-360))
    .force(
      "collide",
      forceCollide<SimNode>().radius((d) => d.w / 2 + 14),
    )
    .force("x", forceX(400).strength(0.03))
    .force("y", forceY(300).strength(0.03))
    .stop();
  for (let i = 0; i < 260; i++) simulation.tick();
  for (const s of sim) pos.set(s.id, { x: s.x - s.w / 2, y: s.y - NODE_H / 2 });
  return pos;
}

function Graph({
  data,
  level,
  root,
  layout,
  search,
  cyclesOnly,
  selected,
  onSelect,
  onDrill,
}: {
  data: ArchitectureResponse;
  level: "dir" | "file";
  root: string | null;
  layout: Layout;
  search: string;
  cyclesOnly: boolean;
  selected: string | null;
  onSelect: (path: string | null) => void;
  onDrill: (path: string) => void;
}) {
  const flow = useReactFlow();
  const { nodes, edges } = useMemo(() => {
    const visibleNodes = cyclesOnly ? data.nodes.filter((n) => n.inCycle) : data.nodes;
    const visible = new Set(visibleNodes.map((n) => n.path));
    const visibleEdges = data.edges.filter((e) => visible.has(e.from) && visible.has(e.to));
    const maxLoc = Math.max(1, ...visibleNodes.map((n) => n.loc));
    const positions = layoutNodes(visibleNodes, visibleEdges, layout, maxLoc);
    const q = search.trim().toLowerCase();
    const neighbors = new Set<string>();
    if (selected) {
      neighbors.add(selected);
      for (const e of visibleEdges) {
        if (e.from === selected) neighbors.add(e.to);
        if (e.to === selected) neighbors.add(e.from);
      }
    }
    const nodes: Node<NodeData>[] = visibleNodes.map((m) => ({
      id: m.path,
      type: "module",
      position: positions.get(m.path) ?? { x: 0, y: 0 },
      data: {
        module: m,
        maxLoc,
        matched: q.length > 0 && m.path.toLowerCase().includes(q),
        dimmed: selected
          ? !neighbors.has(m.path)
          : q.length > 0 && !m.path.toLowerCase().includes(q),
      },
      selected: m.path === selected,
    }));
    const edges: Edge[] = visibleEdges.map((e) => {
      const related = selected ? e.from === selected || e.to === selected : false;
      const color = e.inCycle ? "var(--critical)" : related ? "var(--fg)" : "var(--border-strong)";
      return {
        id: `${e.from}->${e.to}`,
        source: e.from,
        target: e.to,
        style: {
          stroke: color,
          strokeWidth: related ? 1.5 : Math.min(2.5, 0.75 + Math.log2(e.weight) * 0.5),
          strokeDasharray: e.inCycle ? "4 3" : undefined,
          opacity: selected && !related ? 0.2 : 1,
        },
        markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color },
        label: e.weight > 1 ? String(e.weight) : undefined,
        labelStyle: { fontSize: 10, fill: "var(--fg-tertiary)" },
        labelBgStyle: { fill: "var(--bg-subtle)" },
      };
    });
    return { nodes, edges };
  }, [data, layout, search, cyclesOnly, selected]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refit when the graph shape changes
  useEffect(() => {
    const t = setTimeout(() => flow.fitView({ padding: 0.12, duration: 200 }), 30);
    return () => clearTimeout(t);
  }, [level, root, layout, cyclesOnly, data]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.1}
      maxZoom={2}
      nodesDraggable
      nodesConnectable={false}
      zoomOnDoubleClick={false}
      elementsSelectable
      onNodeClick={(_e, n) => onSelect(n.id)}
      onNodeDoubleClick={(_e, n) => {
        if (level === "dir") onDrill(n.id);
      }}
      onPaneClick={() => onSelect(null)}
      proOptions={{ hideAttribution: false }}
    >
      <Background gap={20} size={1} color="var(--border)" />
      <Controls showInteractive={false} position="bottom-left" />
      <MiniMap
        pannable
        zoomable
        position="bottom-right"
        nodeColor={(n) =>
          (n.data as NodeData).module.inCycle ? "var(--critical)" : "var(--fg-tertiary)"
        }
        maskColor="rgb(0 0 0 / 0.06)"
      />
    </ReactFlow>
  );
}

export function ArchitectureView() {
  const repo = useRepo();
  const sp = useSearchParams();
  const { update } = useUrlParams();
  const root = sp.get("root");
  const level: "dir" | "file" = root ? "file" : "dir";
  const arch = useArchitecture(repo.analysis?.id ?? null, level, root ?? undefined);
  const [layout, setLayout] = useState<Layout>("hierarchical");
  const [search, setSearch] = useState("");
  const [cyclesOnly, setCyclesOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const setRoot = useCallback(
    (r: string | null) => {
      setSelected(null);
      update({ root: r });
    },
    [update],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!repo.analysis)
    return (
      <>
        <PageHeader title="Architecture" />
        <EmptyState
          title="No architecture graph yet"
          description="The module graph is built during analysis."
        />
      </>
    );
  const a = repo.analysis;

  if (arch.isPending)
    return (
      <>
        <PageHeader title="Architecture" />
        <Skeleton className="h-[560px]" />
      </>
    );
  if (arch.isError) return <ErrorState error={arch.error} onRetry={() => arch.refetch()} />;
  const data = arch.data;
  const selectedNode = selected ? (data.nodes.find((n) => n.path === selected) ?? null) : null;
  const hubs = [...data.nodes].sort((x, y) => y.fanIn - x.fanIn).slice(0, 8);

  if (data.nodes.length === 0) {
    return (
      <>
        <PageHeader title="Architecture" />
        <EmptyState
          title="No modules to show"
          description={
            level === "file"
              ? "This directory has no parsed source files."
              : "No TypeScript or JavaScript modules were parsed for this commit."
          }
          action={
            level === "file" ? (
              <Button onClick={() => setRoot(null)}>Back to directories</Button>
            ) : null
          }
        />
      </>
    );
  }

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-bg px-3 py-2">
      {level === "file" ? (
        <Button size="sm" variant="ghost" onClick={() => setRoot(null)}>
          <ArrowLeft /> Directories
        </Button>
      ) : null}
      <span className="font-mono text-xs text-fg-secondary">
        {level === "file" ? root : "directory level"}
      </span>
      <span className="text-border-strong" aria-hidden>
        |
      </span>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2 top-[7px] size-3.5 text-fg-tertiary"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find module"
          className="h-7 w-44 pl-7 text-xs"
          aria-label="Find module"
        />
      </div>
      <SegmentedControl
        aria-label="Layout"
        value={layout}
        onChange={setLayout}
        options={[
          { value: "hierarchical", label: "Layered" },
          { value: "force", label: "Force" },
        ]}
        className="h-7"
      />
      <Checkbox
        checked={cyclesOnly}
        onCheckedChange={setCyclesOnly}
        label="Cycles only"
        className="mx-0 h-7 rounded-sm border border-border-strong px-2"
      />
      <span className="ml-auto flex items-center gap-2 text-xs text-fg-tertiary">
        {data.truncated ? <Badge tone="medium">largest {data.nodes.length} shown</Badge> : null}
        <span className="tabular">
          {data.nodes.length} nodes · {data.edges.length} edges
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => setFullscreen((f) => !f)}
          aria-label={fullscreen ? "Exit full screen" : "Full screen"}
        >
          {fullscreen ? <Minimize2 /> : <Maximize2 />}
        </Button>
      </span>
    </div>
  );

  const detail = selectedNode ? (
    <aside
      className="flex w-full flex-col border-t border-border bg-bg lg:w-[300px] lg:border-l lg:border-t-0"
      aria-label="Selected module"
    >
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="eyebrow">{selectedNode.kind === "dir" ? "Directory" : "File"}</div>
          <FilePath
            path={selectedNode.path}
            className="mt-1 block whitespace-normal break-all text-sm"
          />
        </div>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={() => setSelected(null)}
          aria-label="Close details"
        >
          <X />
        </Button>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-2">
        <MetricList>
          <MetricRow label="Lines" value={fmt(selectedNode.loc)} />
          {selectedNode.kind === "dir" ? (
            <MetricRow label="Files" value={fmt(selectedNode.fileCount)} />
          ) : null}
          <MetricRow
            label="Findings"
            value={fmt(selectedNode.findingCount)}
            tone={selectedNode.findingCount ? "warn" : undefined}
          />
          <MetricRow label="Fan-in" hint="imported by" value={fmt(selectedNode.fanIn)} />
          <MetricRow label="Fan-out" hint="imports" value={fmt(selectedNode.fanOut)} />
          <MetricRow
            label="Instability"
            hint="out / (in + out)"
            value={selectedNode.instability === null ? "–" : selectedNode.instability.toFixed(2)}
          />
          <MetricRow
            label="In a cycle"
            value={selectedNode.inCycle ? "yes" : "no"}
            tone={selectedNode.inCycle ? "bad" : undefined}
          />
        </MetricList>
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedNode.kind === "dir" ? (
            <Button size="sm" variant="primary" onClick={() => setRoot(selectedNode.path)}>
              Open files
            </Button>
          ) : null}
          <Button asChild size="sm" variant="secondary">
            <Link href={repo.href("findings", `path=${encodeURIComponent(selectedNode.path)}`)}>
              Findings here
            </Link>
          </Button>
        </div>
        <EdgeList
          title="Imports"
          items={data.edges.filter((e) => e.from === selectedNode.path).map((e) => e.to)}
          onSelect={setSelected}
        />
        <EdgeList
          title="Imported by"
          items={data.edges.filter((e) => e.to === selectedNode.path).map((e) => e.from)}
          onSelect={setSelected}
        />
      </div>
    </aside>
  ) : null;

  return (
    <>
      {!fullscreen ? (
        <PageHeader
          title="Architecture"
          description="Internal import graph. Node width follows size; the left edge colours by finding density; dashed nodes and red edges are part of a cycle. Double-click a directory to open its files."
          meta={
            <>
              <span className="font-mono">{a.commitSha?.slice(0, 7)}</span>
              <span>
                {fmt(data.nodes.length)} {level === "dir" ? "directories" : "files"}
              </span>
              <span>{fmt(data.cycles.length)} cycles</span>
            </>
          }
        />
      ) : null}
      <div
        className={cn(
          "overflow-hidden rounded-md border border-border",
          fullscreen && "fixed inset-0 z-50 rounded-none border-0",
        )}
      >
        {toolbar}
        <div
          className={cn(
            "flex flex-col lg:flex-row",
            fullscreen ? "h-[calc(100vh-49px)]" : "h-[560px]",
          )}
        >
          <div className="min-h-0 min-w-0 flex-1">
            <ReactFlowProvider>
              <Graph
                data={data}
                level={level}
                root={root}
                layout={layout}
                search={search}
                cyclesOnly={cyclesOnly}
                selected={selected}
                onSelect={setSelected}
                onDrill={setRoot}
              />
            </ReactFlowProvider>
          </div>
          {detail}
        </div>
      </div>

      {!fullscreen ? (
        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <Panel>
            <PanelHeader
              title="Dependency cycles"
              description={
                data.cycles.length
                  ? `${data.cycles.length} strongly connected groups`
                  : "none at this level"
              }
            />
            {data.cycles.length ? (
              <ul className="hairlines">
                {data.cycles.slice(0, 12).map((c) => (
                  <li key={c.paths.join("|")} className="px-4 py-2">
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 text-left"
                      onClick={() => {
                        const p = c.paths[0];
                        if (!p) return;
                        if (level === "dir") setRoot(p.slice(0, p.lastIndexOf("/")) || p);
                        setSelected(p);
                      }}
                    >
                      <Badge tone={c.length >= 3 ? "critical" : "high"}>{c.length} files</Badge>
                      <span className="truncate font-mono text-xs text-fg hover:underline">
                        {c.paths
                          .slice(0, 3)
                          .map((p) => truncateMiddle(p, 34))
                          .join(" → ")}
                        {c.length > 3 ? " → …" : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-fg-secondary">
                Modules at this level form a directed acyclic graph.
              </p>
            )}
          </Panel>
          <Panel>
            <PanelHeader title="Most depended upon" description="highest fan-in at this level" />
            <Table>
              <THead>
                <tr>
                  <Th>Module</Th>
                  <Th numeric>Fan-in</Th>
                  <Th numeric>Fan-out</Th>
                  <Th numeric>Lines</Th>
                </tr>
              </THead>
              <TBody>
                {hubs.map((h) => (
                  <Tr key={h.path} interactive onClick={() => setSelected(h.path)}>
                    <Td className="max-w-[300px]">
                      <FilePath path={h.path} />
                    </Td>
                    <Td numeric>{h.fanIn}</Td>
                    <Td numeric className="text-fg-secondary">
                      {h.fanOut}
                    </Td>
                    <Td numeric className="text-fg-secondary">
                      {fmt(h.loc)}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </Panel>
        </section>
      ) : null}
    </>
  );
}

function EdgeList({
  title,
  items,
  onSelect,
}: {
  title: string;
  items: string[];
  onSelect: (path: string) => void;
}) {
  return (
    <div className="mt-4">
      <div className="eyebrow mb-1">
        {title} <span className="tabular normal-case tracking-normal">({items.length})</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-fg-tertiary">None</p>
      ) : (
        <ul className="max-h-40 space-y-0.5 overflow-y-auto">
          {items.map((p) => (
            <li key={p}>
              <button
                type="button"
                className="block w-full truncate text-left font-mono text-xs text-fg-secondary hover:text-fg"
                onClick={() => onSelect(p)}
              >
                {p}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
