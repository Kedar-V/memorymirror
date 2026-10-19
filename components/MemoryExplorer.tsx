"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";
import { getPersona } from "@/lib/demo-personas";
import {
  EDGE_MEANING,
  buildGraph,
  eventsFor,
  lineageIds,
  visibleAt,
  type GraphNode,
} from "@/lib/lineage";
import { useMemoryStore, versionChain } from "@/lib/memory-store";
import { categoryOf, dateLabel, kindLabel, verifiedEvidence } from "@/lib/present";


function CardNode({ data }: NodeProps) {
  return (
    <div style={{ fontSize: 12, lineHeight: 1.35 }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--ink-dim)" }}>{String(data.caption ?? "")}</div>
      <div>{String(data.label ?? "")}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { card: CardNode };

function layout(nodes: GraphNode[], edges: { id: string; source: string; target: string; label: string; provenance: boolean }[]) {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "LR", nodesep: 36, ranksep: 80 });
  nodes.forEach((node) => graph.setNode(node.id, { width: node.type === "cluster" ? 180 : 230, height: 78 }));
  edges.forEach((edge) => graph.setEdge(edge.source, edge.target));
  dagre.layout(graph);
  const flowNodes: Node[] = nodes.map((node) => {
    const point = graph.node(node.id);
    return {
      id: node.id,
      type: "card",
      position: { x: (point?.x ?? 0) - 90, y: (point?.y ?? 0) - 30 },
      data: { ...node },
      style: { width: node.type === "cluster" ? 180 : 230 },
    };
  });
  const flowEdges: Edge[] = edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: edge.provenance ? "var(--info)" : "var(--warn)", strokeDasharray: edge.provenance ? "4 3" : undefined },
    labelStyle: { fontSize: 11, fill: "var(--ink-dim)" },
  }));
  return { flowNodes, flowEdges };
}

function Canvas() {
  const memories = useMemoryStore((state) => state.memories);
  const messages = useMemoryStore((state) => state.messages);
  const relationships = useMemoryStore((state) => state.relationships);
  const selectedId = useMemoryStore((state) => state.selectedMemoryId);
  const selectMemory = useMemoryStore((state) => state.selectMemory);
  const personaId = useMemoryStore((state) => state.personaId);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "explicit" | "inference">("all");
  const [life, setLife] = useState<"active" | "historical">("active");
  const [showEvidence, setShowEvidence] = useState(false);
  const [showRelations, setShowRelations] = useState(true);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [asOf, setAsOf] = useState(Date.now());
  const name = getPersona(personaId).name;
  const timed = useMemo(() => visibleAt(memories, asOf), [memories, asOf]);
  const built = useMemo(
    () => buildGraph({
      name,
      userId: personaId,
      memories: timed,
      messages,
      relationships: relationships.filter((item) => item.userId === personaId && item.status === "active"),
      expanded,
      showEvidence,
      showRelations,
      query,
      kind,
      life,
      selectedId,
    }),
    [name, timed, messages, relationships, personaId, expanded, showEvidence, showRelations, query, kind, life, selectedId],
  );
  const placed = useMemo(() => {
    const fan = built.nodes.some((node) => node.type === "inference");
    const about = built.nodes
      .filter((node) => node.type === "conversation" || node.type === "profile" || node.type === "cluster" || (fan ? node.type === "inference" : node.memoryId))
      .map((node) => ({
        id: `about:${node.id}`,
        source: "person",
        target: node.id,
        label: "",
        provenance: false,
      }));
    return layout(built.nodes, [...built.edges, ...about]);
  }, [built]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const flow = useReactFlow();

  useEffect(() => {
    if (!selectedId) return;
    const memory = memories.find((item) => item.id === selectedId);
    if (!memory) return;
    const category = categoryOf(memory.claim);
    setExpanded((current) => (current.includes(category) ? current : [...current, category]));
  }, [selectedId, memories]);

  useEffect(() => {
    const focus = lineageIds(built.edges, selectedId);
    setNodes(placed.flowNodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        label: node.data.label,
      },
      style: {
        ...node.style,
        opacity: !selectedId || focus.has(node.id) || node.id === "person" ? 1 : 0.28,
        border: node.id === selectedId ? "2px solid var(--accent)" : "1px solid var(--line)",
        borderRadius: 8,
        background: node.data.type === "inference"
          ? "color-mix(in srgb, var(--warn) 18%, var(--panel))"
          : node.data.type === "explicit"
            ? "color-mix(in srgb, var(--good) 14%, var(--panel))"
            : node.data.type === "version"
              ? "color-mix(in srgb, var(--ink) 8%, var(--panel))"
              : node.data.type === "evidence" || node.data.type === "conversation"
                ? "color-mix(in srgb, var(--info) 12%, var(--panel))"
                : node.data.type === "profile"
                  ? "color-mix(in srgb, var(--accent) 12%, var(--panel))"
                  : "var(--panel)",
        color: "var(--ink)",
        padding: 8,
        fontSize: 12,
      },
    })));
    setEdges(placed.flowEdges.map((edge) => ({
      ...edge,
      style: {
        ...edge.style,
        opacity: !selectedId || focus.has(String(edge.source)) || focus.has(String(edge.target)) ? 1 : 0.15,
      },
    })));
    const frame = requestAnimationFrame(() => flow.fitView({ padding: 0.2 }));
    return () => cancelAnimationFrame(frame);
  }, [placed, built.edges, selectedId, setNodes, setEdges, flow]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="memory-search">Search beliefs</label>
        <input id="memory-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search beliefs" className="rounded-md border bg-transparent px-3 py-1.5 text-sm" style={{ borderColor: "var(--line)" }} />
        <select aria-label="Kind" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} className="rounded-md border bg-transparent px-2 py-1.5 text-sm" style={{ borderColor: "var(--line)" }}>
          <option value="all">Stated and assumed</option>
          <option value="explicit">You told me</option>
          <option value="inference">AI assumption</option>
        </select>
        <select aria-label="Time filter" value={life} onChange={(event) => setLife(event.target.value as typeof life)} className="rounded-md border bg-transparent px-2 py-1.5 text-sm" style={{ borderColor: "var(--line)" }}>
          <option value="active">In use</option>
          <option value="historical">Earlier versions</option>
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showEvidence} onChange={(event) => setShowEvidence(event.target.checked)} /> Messages</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showRelations} onChange={(event) => setShowRelations(event.target.checked)} /> Links</label>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="card h-[560px]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodesFocusable
            onNodeClick={(_, node) => {
              const data = node.data as GraphNode;
              if (data.type === "cluster" && data.category) {
                setExpanded((current) => current.includes(data.category!) ? current.filter((item) => item !== data.category) : [...current, data.category!]);
                return;
              }
              if (data.memoryId) selectMemory(data.memoryId);
            }}
            aria-label="Memory lineage"
          >
            <Background gap={18} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <Inspector asOf={asOf} />
      </div>
      <ul className="flex flex-wrap gap-3 text-xs" aria-label="Node types">
        {["Conversation message", "Explicit memory", "Inferred memory", "Earlier version", "AI response"].map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <p className="text-xs leading-5" style={{ color: "var(--ink-dim)" }}>
        Solid links are relationships. Dashed links are where a belief came from. A cluster hides its beliefs until you open it.
      </p>
      <ul className="flex flex-wrap gap-3 text-xs" style={{ color: "var(--ink-dim)" }}>
        {Object.entries(EDGE_MEANING).filter(([type]) => type !== "RELATED_TO").map(([type, meaning]) => (
          <li key={type}><span className="font-semibold">{type}</span> {meaning}</li>
        ))}
      </ul>
      <label className="block text-sm">
        Show beliefs learned by this date
        <input
          type="range"
          min={0}
          max={100}
          defaultValue={100}
          aria-valuetext={new Date(asOf).toDateString()}
          onChange={(event) => {
            const stamps = memories.map((memory) => Date.parse(memory.createdAt)).filter((value) => !Number.isNaN(value));
            const min = Math.min(...stamps, Date.now());
            const max = Date.now();
            const ratio = Number(event.target.value) / 100;
            setAsOf(min + (max - min) * ratio);
          }}
          className="mt-1 block w-full"
        />
      </label>
      {selectedId && (
        <ol className="space-y-1 text-sm">
          {eventsFor(memories.find((memory) => memory.id === selectedId)!, memories).map((event) => (
            <li key={`${event.type}-${event.at}`}>{dateLabel(event.at)} · {event.text}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Inspector({ asOf }: { asOf: number }) {
  const memories = useMemoryStore((state) => state.memories);
  const messages = useMemoryStore((state) => state.messages);
  const relationships = useMemoryStore((state) => state.relationships);
  const selectedId = useMemoryStore((state) => state.selectedMemoryId);
  const removeRelationship = useMemoryStore((state) => state.removeRelationship);
  const correct = useMemoryStore((state) => state.correct);
  const [draft, setDraft] = useState("");
  const selected = memories.find((memory) => memory.id === selectedId) ?? null;
  const historical = selected && Date.parse(selected.createdAt) <= asOf ? selected : null;
  const shown = historical ?? selected;

  useEffect(() => {
    setDraft(shown?.claim ?? "");
  }, [shown?.id, shown?.claim]);

  if (!shown) {
    return (
      <aside className="card" aria-label="Belief explanation">
        <h2 className="serif text-2xl">Pick a belief</h2>
        <p className="mt-2 text-sm leading-6" style={{ color: "var(--ink-dim)" }}>
          Open a group in the map. The evidence, history, and comparison below follow that choice.
        </p>
      </aside>
    );
  }
  const evidence = verifiedEvidence(shown, messages);
  const chain = versionChain(memories, shown.id);
  const related = relationships.filter((item) => item.status === "active" && (item.sourceId === shown.id || item.targetId === shown.id));
  return (
    <aside className="card max-h-[560px] overflow-y-auto" aria-label="Belief explanation">
      <p className="kicker">{kindLabel(shown.kind)}</p>
      <h2 className="serif mt-2 text-2xl leading-tight">What the AI believes</h2>
      <p className="mt-2 text-sm leading-6">{shown.claim}</p>
      <h3 className="mt-4 text-sm font-semibold">Where it came from</h3>
      {evidence.unavailable && <p className="mt-1 text-sm">Source unavailable.</p>}
      {evidence.sources.map((message) => (
        <p key={message.id} className="mt-2 text-sm leading-6">“{message.content}”</p>
      ))}
      <h3 className="mt-4 text-sm font-semibold">How it was derived</h3>
      <p className="mt-1 text-sm leading-6">
        {shown.kind === "explicit"
          ? "This was stored as something the person said."
          : "This is an assumption that needs confirmation. A supporting fact does not prove it. Preferring short meetings does not mean the person dislikes meetings."}
      </p>
      <h3 className="mt-4 text-sm font-semibold">What may be wrong</h3>
      <p className="mt-1 text-sm leading-6" style={{ color: "var(--ink-dim)" }}>
        {shown.kind === "inference"
          ? "Compare the quote with the belief. If the belief is broader than the quote, treat it as unconfirmed."
          : "A later correction replaces this version. The older wording stays in the history."}
      </p>
      <h3 className="mt-4 text-sm font-semibold">History</h3>
      <ol className="mt-2 space-y-2">
        {chain.map((memory) => (
          <li key={memory.id} className="text-sm leading-6">
            {dateLabel(memory.createdAt)} · {eventsFor(memory, memories).map((event) => event.text).join(" ")} {memory.claim}
          </li>
        ))}
      </ol>
      {related.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-semibold">Recorded links</h3>
          <ul className="mt-2 space-y-2">
            {related.map((item) => (
              <li key={item.id} className="text-sm">
                {item.type}: {EDGE_MEANING[item.type]}
                {item.kind === "inference" && (
                  <button type="button" className="btn ml-2" onClick={() => removeRelationship(item.id)}>Remove link</button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <label className="mt-4 block text-sm" htmlFor="apply-claim">Apply a correction to the saved belief</label>
      <textarea id="apply-claim" value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} className="mt-1 w-full rounded-md border bg-transparent px-2 py-1 text-sm" style={{ borderColor: "var(--line)" }} />
      <button type="button" className="btn mt-2" onClick={() => correct(shown.id, draft)}>Apply this correction</button>
    </aside>
  );
}

export default function MemoryExplorer() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}
