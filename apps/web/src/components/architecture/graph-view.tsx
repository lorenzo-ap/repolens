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
import { ArrowLeft, Expand, Maximize2, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useRepo } from "@/components/repo/context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Checkbox, Input } from "@/components/ui/input";
import { Table, TBody, Td, THead, Th, Tr } from "@/components/ui/table";
import { SegmentedControl } from "@/components/ui/tabs";
import { useArchitecture } from "@/lib/queries";
import { cn, fmt, truncateMiddle } from "@/lib/utils";

type Layout = "hierarchical" | "force";

interface NodeData extends Record<string, unknown> {
  module: ModuleNode;
  dimmed: boolean;
  matched: boolean;
  maxLoc: number;
}

const ModuleNodeView = memo(function ModuleNodeView({ data, selected }: NodeProps<Node<NodeData>>) {
  const { module: m, dimmed, matched, maxLoc } = data;
  const density = m.loc > 0 ? m.findingCount / Math.max(1, m.loc / 100) : 0; // findings per 100 lines
  const heat =
    density >= 3
      ? "border-critical"
      : density >= 1
        ? "border-high"
        : density > 0
          ? "border-medium"
          : "border-border-strong";
  const width = 140 + Math.round((m.loc / Math.max(1, maxLoc)) * 100);
  const label = m.kind === "dir" ? m.path : m.path.slice(m.path.lastIndexOf("/") + 1);
  return (
    <div
      className={cn(
        "rounded-md border-2 bg-surface px-2.5 py-1.5 font-mono text-xs shadow-popover transition-opacity",
        heat,
        selected && "outline outline-2 outline-accent",
        matched && "outline outline-2 outline-accent/60",
        dimmed && "opacity-25",
        m.inCycle && "border-dashed",
      )}
      style={{ width }}
      title={m.path}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-1.5 !border-0 !bg-border-strong"
      />
      <div className="truncate text-fg">{label}</div>
      <div className="mt-0.5 flex items-center gap-2 text-2xs text-fg-subtle">
        <span className="tabular">{fmt(m.loc)} loc</span>
        <span className="tabular">
          ↓{m.fanIn} ↑{m.fanOut}
        </span>
        {m.findingCount ? <span className="tabular text-fg-muted">{m.findingCount} f</span> : null}
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
  const widthOf = (m: ModuleNode) => 140 + Math.round((m.loc / Math.max(1, maxLoc)) * 100);
  if (layout === "hierarchical") {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "TB", nodesep: 24, ranksep: 56, marginx: 20, marginy: 20 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of nodes) g.setNode(n.path, { width: widthOf(n), height: 44 });
    for (const e of edges) g.setEdge(e.from, e.to);
    dagre.layout(g);
    for (const n of nodes) {
      const p = g.node(n.path);
      pos.set(n.path, { x: p.x - widthOf(n) / 2, y: p.y - 22 });
    }
    return pos;
  }
  interface SimNode extends SimulationNodeDatum {
    id: string;
    w: number;
    x: number;
    y: number;
  }
  const sim: SimNode[] = nodes.map((n) => ({
    id: n.path,
    x: Math.random() * 800,
    y: Math.random() * 600,
    w: widthOf(n),
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
        .distance(120)
        .strength(0.4),
    )
    .force("charge", forceManyBody().strength(-380))
    .force(
      "collide",
      forceCollide<SimNode>().radius((d) => d.w / 2 + 16),
    )
    .force("x", forceX(400).strength(0.03))
    .force("y", forceY(300).strength(0.03))
    .stop();
  for (let i = 0; i < 250; i++) simulation.tick();
  for (const s of sim) pos.set(s.id, { x: s.x - s.w / 2, y: s.y - 22 });
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
      return {
        id: `${e.from}->${e.to}`,
        source: e.from,
        target: e.to,
        animated: false,
        style: {
          stroke: e.inCycle
            ? "var(--critical)"
            : related
              ? "var(--accent)"
              : "var(--border-strong)",
          strokeWidth: related ? 1.75 : Math.min(3, 0.75 + Math.log2(e.weight)),
          strokeDasharray: e.inCycle ? "5 3" : undefined,
          opacity: selected && !related ? 0.15 : 1,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          color: e.inCycle ? "var(--critical)" : related ? "var(--accent)" : "var(--border-strong)",
        },
        label: e.weight > 1 ? String(e.weight) : undefined,
        labelStyle: { fontSize: 10, fill: "var(--fg-subtle)" },
        labelBgStyle: { fill: "var(--bg)" },
      };
    });
    return { nodes, edges };
  }, [data, layout, search, cyclesOnly, selected]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refit when the graph shape changes
  useEffect(() => {
    const t = setTimeout(() => flow.fitView({ padding: 0.15, duration: 200 }), 30);
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
      elementsSelectable
      onNodeClick={(_e, n) => onSelect(n.id)}
      onNodeDoubleClick={(_e, n) => {
        if (level === "dir") onDrill(n.id);
      }}
      onPaneClick={() => onSelect(null)}
      proOptions={{ hideAttribution: false }}
      className="rounded-md border border-border"
    >
      <Background gap={24} size={1} color="var(--border)" />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) =>
          (n.data as NodeData).module.inCycle ? "var(--critical)" : "var(--border-strong)"
        }
        maskColor="rgb(0 0 0 / 0.08)"
      />
    </ReactFlow>
  );
}

export function ArchitectureView() {
  const repo = useRepo();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
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
      const next = new URLSearchParams(sp.toString());
      if (r) next.set("root", r);
      else next.delete("root");
      setSelected(null);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [sp, router, pathname],
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
      <EmptyState
        title="No architecture graph yet"
        description="The module graph is built during analysis."
      />
    );
  if (arch.isPending) return <Skeleton className="h-[560px]" />;
  if (arch.isError) return <ErrorState error={arch.error} onRetry={() => arch.refetch()} />;
  const data = arch.data;
  const selectedNode = selected ? (data.nodes.find((n) => n.path === selected) ?? null) : null;
  const q = repo.preserveQuery ? `&${repo.preserveQuery}` : "";
  const base = `/r/${repo.owner}/${repo.name}`;
  const hubs = [...data.nodes].sort((a, b) => b.fanIn - a.fanIn).slice(0, 8);

  if (data.nodes.length === 0) {
    return (
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
    );
  }

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      {level === "file" ? (
        <Button size="sm" variant="ghost" onClick={() => setRoot(null)}>
          <ArrowLeft /> Directories
        </Button>
      ) : null}
      <span className="font-mono text-xs text-fg-muted">
        {level === "file" ? root : "directory level"}
      </span>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2 top-2 size-3.5 text-fg-subtle"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find module…"
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
      />
      <Checkbox
        checked={cyclesOnly}
        onCheckedChange={setCyclesOnly}
        label="Cycles only"
        className="h-7 border border-border-strong rounded-md"
      />
      <span className="ml-auto flex items-center gap-2 text-xs text-fg-subtle">
        {data.truncated ? <Badge tone="medium">Largest {data.nodes.length} shown</Badge> : null}
        <span className="tabular">
          {data.nodes.length} nodes · {data.edges.length} edges
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => setFullscreen((f) => !f)}
          aria-label={fullscreen ? "Exit full screen" : "Full screen"}
        >
          {fullscreen ? <Expand /> : <Maximize2 />}
        </Button>
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className={cn(fullscreen && "fixed inset-0 z-50 flex flex-col gap-3 bg-bg p-4")}>
        {toolbar}
        <div
          className={cn(
            "mt-3 grid gap-4",
            fullscreen ? "min-h-0 flex-1" : "",
            selectedNode ? "lg:grid-cols-[1fr_300px]" : "",
          )}
        >
          <div className={cn(fullscreen ? "h-full min-h-0" : "h-[560px]")}>
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
          {selectedNode ? (
            <Card className="scrollbar-thin overflow-y-auto">
              <CardHeader
                title={<span className="break-all font-mono text-xs">{selectedNode.path}</span>}
                description={
                  selectedNode.kind === "dir" ? `${fmt(selectedNode.fileCount)} files` : "file"
                }
              />
              <CardBody className="space-y-3 text-sm">
                <dl className="grid grid-cols-2 gap-2">
                  <Metric label="Lines" value={fmt(selectedNode.loc)} />
                  <Metric label="Findings" value={fmt(selectedNode.findingCount)} />
                  <Metric
                    label="Fan-in"
                    value={fmt(selectedNode.fanIn)}
                    hint="modules importing it"
                  />
                  <Metric
                    label="Fan-out"
                    value={fmt(selectedNode.fanOut)}
                    hint="modules it imports"
                  />
                  <Metric
                    label="Instability"
                    value={
                      selectedNode.instability === null ? "–" : selectedNode.instability.toFixed(2)
                    }
                    hint="out / (in + out)"
                  />
                  <Metric label="In cycle" value={selectedNode.inCycle ? "yes" : "no"} />
                </dl>
                <div className="flex flex-wrap gap-2">
                  {selectedNode.kind === "dir" ? (
                    <Button size="sm" onClick={() => setRoot(selectedNode.path)}>
                      Open files
                    </Button>
                  ) : null}
                  <Button asChild size="sm" variant="ghost">
                    <Link
                      href={`${base}/findings?path=${encodeURIComponent(selectedNode.path)}${q}`}
                    >
                      Findings here
                    </Link>
                  </Button>
                </div>
                <div>
                  <p className="label-caps mb-1">Imports</p>
                  <ul className="max-h-40 space-y-0.5 overflow-y-auto font-mono text-xs text-fg-muted">
                    {data.edges
                      .filter((e) => e.from === selectedNode.path)
                      .map((e) => (
                        <li key={e.to}>
                          <button
                            type="button"
                            className="truncate hover:text-fg"
                            onClick={() => setSelected(e.to)}
                          >
                            {e.to}
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
                <div>
                  <p className="label-caps mb-1">Imported by</p>
                  <ul className="max-h-40 space-y-0.5 overflow-y-auto font-mono text-xs text-fg-muted">
                    {data.edges
                      .filter((e) => e.to === selectedNode.path)
                      .map((e) => (
                        <li key={e.from}>
                          <button
                            type="button"
                            className="truncate hover:text-fg"
                            onClick={() => setSelected(e.from)}
                          >
                            {e.from}
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Dependency cycles"
            description={
              data.cycles.length
                ? `${data.cycles.length} strongly connected groups`
                : "No cycles at this level"
            }
          />
          {data.cycles.length ? (
            <ul className="divide-y divide-border">
              {data.cycles.slice(0, 12).map((c) => (
                <li key={c.paths.join("|")} className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={c.length >= 3 ? "critical" : "high"}>{c.length} files</Badge>
                    <button
                      type="button"
                      className="truncate font-mono text-xs text-fg hover:underline"
                      onClick={() => {
                        const p = c.paths[0];
                        if (!p) return;
                        if (level === "dir") setRoot(p.slice(0, p.lastIndexOf("/")) || p);
                        setSelected(p);
                      }}
                    >
                      {c.paths
                        .slice(0, 3)
                        .map((p) => truncateMiddle(p, 36))
                        .join(" → ")}
                      {c.length > 3 ? " → …" : ""}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <CardBody>
              <p className="text-sm text-fg-muted">
                Modules at this level form a directed acyclic graph.
              </p>
            </CardBody>
          )}
        </Card>
        <Card>
          <CardHeader title="Most depended upon" description="Highest fan-in at this level" />
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
                  <Td mono className="max-w-[300px] truncate" title={h.path}>
                    {truncateMiddle(h.path, 44)}
                  </Td>
                  <Td numeric>{h.fanIn}</Td>
                  <Td numeric>{h.fanOut}</Td>
                  <Td numeric>{fmt(h.loc)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-2xs uppercase tracking-[0.04em] text-fg-subtle">{label}</dt>
      <dd className="tabular font-medium">{value}</dd>
      {hint ? <dd className="text-2xs text-fg-subtle">{hint}</dd> : null}
    </div>
  );
}
