"use client";

import { useEffect, useRef } from "react";
import {
  Background,
  Controls,
  Handle,
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
import "@xyflow/react/dist/style.css";
import { getPersona } from "@/lib/demo-personas";
import { useMemoryStore } from "@/lib/memory-store";
import { kindLabel, statusLabel } from "@/lib/present";
import type { Memory } from "@/lib/schemas";

function MemoryNode({ data }: NodeProps) {
  const selected = Boolean(data.selected);
  const status = String(data.status ?? "");
  return (
    <div
      style={{
        width: 220,
        borderRadius: 16,
        border: `1px solid ${selected ? "var(--accent)" : "var(--line)"}`,
        background: selected ? "color-mix(in srgb, var(--accent) 18%, var(--glass))" : "var(--panel)",
        color: "var(--ink)",
        padding: "10px 12px",
        opacity: status === "superseded" ? 0.55 : 1,
        boxShadow: selected ? "inset 0 1px 0 var(--glass-shine)" : "none",
        backdropFilter: selected ? "blur(16px) saturate(1.6)" : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div className={`status-${status}`} style={{ fontSize: 11 }}>
        {String(data.caption)}
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.35 }}>{String(data.claim)}</p>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function UserNode({ data }: NodeProps) {
  return (
    <div
      style={{
        width: 168,
        borderRadius: 6,
        border: "1px solid var(--line)",
        background: "var(--panel)",
        color: "var(--ink)",
        textAlign: "center",
        padding: "12px 10px",
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)" }}>
        Person
      </div>
      <div className="serif" style={{ fontSize: 16 }}>{String(data.name)}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { memory: MemoryNode, person: UserNode };

function build(memories: Memory[], name: string, selectedId: string | null) {
  const visible = memories.filter((memory) => memory.status !== "deleted");
  const nodes: Node[] = [
    {
      id: "user",
      type: "person",
      position: { x: 340, y: 250 },
      data: { name, selected: selectedId === "user" },
    },
  ];
  const edges: Edge[] = [];
  visible.forEach((memory, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(visible.length, 1) - Math.PI / 2;
    nodes.push({
      id: memory.id,
      type: "memory",
      position: {
        x: 300 + 250 * Math.cos(angle),
        y: 220 + 210 * Math.sin(angle),
      },
      selected: memory.id === selectedId,
      data: {
        claim: memory.claim,
        caption: `${kindLabel(memory.kind)} · ${statusLabel(memory.status)}`,
        status: memory.status,
        selected: memory.id === selectedId,
      },
    });
    edges.push({
      id: `e-${memory.id}`,
      source: "user",
      target: memory.id,
      label: (memory.evidence[0] ?? "evidence").slice(0, 42),
      style: { stroke: memory.id === selectedId ? "var(--accent)" : "var(--line)" },
      labelStyle: { fill: "var(--ink-dim)", fontSize: 10 },
      labelBgStyle: { fill: "var(--panel)" },
      labelBgPadding: [4, 2],
    });
  });
  return { nodes, edges };
}

function Canvas() {
  const memories = useMemoryStore((state) => state.memories);
  const selectedId = useMemoryStore((state) => state.selectedMemoryId);
  const selectMemory = useMemoryStore((state) => state.selectMemory);
  const personaId = useMemoryStore((state) => state.personaId);
  const theme = useMemoryStore((state) => state.theme);
  const name = getPersona(personaId).name;
  const sig = memories.map((memory) => `${memory.id}:${memory.status}:${memory.claim}`).join("|");
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const flow = useReactFlow();
  const visible = memories.some((memory) => memory.status !== "deleted");

  useEffect(() => {
    const built = build(useMemoryStore.getState().memories, name, selectedRef.current);
    setNodes(built.nodes);
    setEdges(built.edges);
    const frame = requestAnimationFrame(() => {
      flow.fitView({ padding: 0.2 });
    });
    return () => cancelAnimationFrame(frame);
  }, [sig, name, flow, setNodes, setEdges]);

  useEffect(() => {
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        selected: node.id === selectedId,
        data: { ...node.data, selected: node.id === selectedId },
      })),
    );
    setEdges((current) =>
      current.map((edge) => ({
        ...edge,
        style: { ...edge.style, stroke: edge.target === selectedId ? "var(--accent)" : "var(--line)" },
      })),
    );
  }, [selectedId, setNodes, setEdges]);

  return (
    <div className="relative h-full min-h-[520px]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        colorMode={theme === "dark" ? "dark" : "light"}
        nodesFocusable
        nodesDraggable
        elementsSelectable
        panOnScroll
        onNodeClick={(_, node) => selectMemory(node.id === "user" ? null : node.id)}
        onPaneClick={() => selectMemory(null)}
        proOptions={{ hideAttribution: false }}
        aria-label="Memory graph"
      >
        <Background color="var(--line)" gap={18} />
        <Controls showInteractive={false} />
      </ReactFlow>
      {!visible && (
        <p className="pointer-events-none absolute bottom-14 left-4 right-16 text-sm" style={{ color: "var(--ink-dim)" }}>
          No memories on the map. Forgotten beliefs can be restored above.
        </p>
      )}
    </div>
  );
}

export default function MemoryGraph() {
  return (
    <section className="panel h-full min-h-[520px] overflow-hidden" aria-label="Memory graph">
      <ReactFlowProvider>
        <Canvas />
      </ReactFlowProvider>
    </section>
  );
}
