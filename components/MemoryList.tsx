"use client";

import { ChevronRight } from "lucide-react";
import { useMemoryStore } from "@/lib/memory-store";
import { chainHeads, memoryType } from "@/lib/present";
import type { Memory } from "@/lib/schemas";

export function TypeBadge({ memory }: { memory: Pick<Memory, "kind" | "modelReportedConfidence"> }) {
  const type = memoryType(memory);
  return <span className={`badge type-${type}`}>{type}</span>;
}

export default function MemoryList() {
  const memories = useMemoryStore((state) => state.memories);
  const personaId = useMemoryStore((state) => state.personaId);
  const selectedId = useMemoryStore((state) => state.selectedMemoryId);
  const selectMemory = useMemoryStore((state) => state.selectMemory);
  const heads = chainHeads(memories);
  const forgotten = memories.filter((memory) => memory.status === "deleted");

  function row(memory: Memory, index: number) {
    const selected = memory.id === selectedId;
    return (
      <li key={memory.id} className="rise" style={{ animationDelay: `${Math.min(index, 12) * 60}ms` }}>
        <button
          type="button"
          className="card flex w-full items-center gap-3 text-left transition-colors hover:border-[color:var(--ink-dim)]"
          data-selected={selected}
          aria-pressed={selected}
          onClick={() => selectMemory(memory.id)}
        >
          <span className="min-w-0 flex-1">
            <span className={`block text-[15px] leading-snug ${memory.status === "deleted" ? "line-through opacity-60" : ""}`}>{memory.claim}</span>
            <span className="mt-2 flex flex-wrap items-center gap-2">
              <TypeBadge memory={memory} />
              {memory.status === "candidate" && <span className="text-xs" style={{ color: "var(--ink-dim)" }}>Not confirmed</span>}
              {memory.version > 1 && <span className="text-xs" style={{ color: "var(--ink-dim)" }}>Corrected</span>}
            </span>
          </span>
          <ChevronRight aria-hidden className="size-4 shrink-0" style={{ color: "var(--ink-dim)" }} />
        </button>
      </li>
    );
  }

  return (
    <section className="flex min-h-0 flex-col" aria-label="What the AI remembers">
      <header className="pb-3">
        <h2 className="serif text-xl">What the AI remembers</h2>
        <p className="mt-0.5 text-sm" style={{ color: "var(--ink-dim)" }}>
          {heads.length} {heads.length === 1 ? "memory" : "memories"} from this conversation. Select one to see why.
        </p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 pb-2">
        {heads.length === 0 && (
          <p className="text-sm" style={{ color: "var(--ink-dim)" }}>No memories yet. Ask the AI something below and new memories appear here.</p>
        )}
        <ul key={personaId} className="space-y-2">{heads.map(row)}</ul>
        {forgotten.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm" style={{ color: "var(--ink-dim)" }}>Forgotten ({forgotten.length})</summary>
            <ul className="mt-2 space-y-2">{forgotten.map(row)}</ul>
          </details>
        )}
      </div>
    </section>
  );
}
