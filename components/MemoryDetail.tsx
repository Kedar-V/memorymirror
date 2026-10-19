"use client";

import { Fragment, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Network, Pencil, Trash2, Undo2 } from "lucide-react";
import { TypeBadge } from "@/components/MemoryList";
import { useMemoryStore, versionChain } from "@/lib/memory-store";
import { memoryType, verifiedEvidence } from "@/lib/present";
import type { ChatMessage, Memory } from "@/lib/schemas";

function day(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function highlight(content: string, quotes: string[]) {
  const lower = content.toLowerCase();
  const spans = quotes
    .map((quote) => ({ start: lower.indexOf(quote.toLowerCase()), length: quote.length }))
    .filter((span) => span.start >= 0)
    .sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const span of spans) {
    if (span.start < at) continue;
    parts.push(content.slice(at, span.start));
    parts.push(<mark key={span.start} className="evidence">{content.slice(span.start, span.start + span.length)}</mark>);
    at = span.start + span.length;
  }
  parts.push(content.slice(at));
  return parts;
}

function why(memory: Memory, sources: number) {
  const type = memoryType(memory);
  if (type === "Explicit") return "You said this directly. The AI saved your own words as a fact about you.";
  const from = `${sources} ${sources === 1 ? "message" : "messages"}`;
  if (type === "Inferred") return `You never said this outright. The AI interpreted it from ${from}.`;
  return `You never said this, and the evidence in ${from} does not clearly establish it. Treat it as a guess.`;
}

function Connections({ memory, sources, parents }: { memory: Memory; sources: ChatMessage[]; parents: Memory[] }) {
  const columns = [
    { title: "Your messages", items: sources.map((message) => message.content) },
    ...(parents.length ? [{ title: "Facts it builds on", items: parents.map((parent) => parent.claim) }] : []),
    { title: memoryType(memory) === "Explicit" ? "Saved memory" : "AI interpretation", items: [memory.claim], last: true },
  ];
  if (!sources.length) return <p className="text-sm" style={{ color: "var(--ink-dim)" }}>No linked messages are stored for this memory.</p>;
  return (
    <div className="fade flex items-stretch gap-2 overflow-x-auto">
      {columns.map((column, index) => (
        <Fragment key={column.title}>
          {index > 0 && <ArrowRight aria-hidden className="size-4 shrink-0 self-center" style={{ color: "var(--ink-dim)" }} />}
          <div className="flex min-w-36 flex-1 flex-col justify-center gap-2">
            <p className="kicker">{column.title}</p>
            {column.items.map((item) => (
              <p
                key={item}
                className="rounded-lg border px-2.5 py-2 text-xs leading-5"
                style={{
                  borderColor: "last" in column ? "var(--accent)" : "var(--line)",
                  background: "last" in column ? "var(--accent-soft)" : "var(--panel)",
                }}
              >
                {item}
              </p>
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

export default function MemoryDetail() {
  const memories = useMemoryStore((state) => state.memories);
  const messages = useMemoryStore((state) => state.messages);
  const selectedId = useMemoryStore((state) => state.selectedMemoryId);
  const selectMemory = useMemoryStore((state) => state.selectMemory);
  const approve = useMemoryStore((state) => state.approve);
  const correct = useMemoryStore((state) => state.correct);
  const deleteMemory = useMemoryStore((state) => state.deleteMemory);
  const restore = useMemoryStore((state) => state.restore);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [graph, setGraph] = useState(false);
  const [notice, setNotice] = useState<{ id: string; text: string } | null>(null);
  const memory = memories.find((item) => item.id === selectedId);

  if (!memory) {
    return (
      <section className="panel hidden h-full place-items-center p-8 text-center lg:grid" aria-label="Memory explanation">
        <div>
          <p className="serif text-lg">Select a memory to understand why the AI believes it.</p>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-dim)" }}>You’ll see the exact words it came from, and you can correct or forget it.</p>
        </div>
      </section>
    );
  }

  const type = memoryType(memory);
  const evidence = verifiedEvidence(memory, messages);
  const parents = memories.filter((item) => memory.derivedFromIds?.includes(item.id));
  const chain = versionChain(memories, memory.id);
  const active = memory.status === "approved" || memory.status === "candidate";
  const shownNotice = notice?.id === memory.id ? notice.text : null;
  const prior = chain[chain.findIndex((item) => item.id === memory.id) - 1];
  const userCorrected = Boolean(prior && prior.evidence.join("|") === memory.evidence.join("|"));

  function saveCorrection() {
    const next = draft.trim();
    if (!memory || !next || next === memory.claim) return;
    correct(memory.id, next);
    setEditing(false);
    setNotice({ id: useMemoryStore.getState().selectedMemoryId ?? "", text: "Updated. The AI will use this wording from now on." });
  }

  return (
    <section
      key={memory.id}
      className={`panel slide-in fixed inset-0 z-30 flex flex-col overflow-hidden rounded-none lg:static lg:z-auto lg:h-full lg:rounded-[14px] ${shownNotice ? "flash" : ""}`}
      aria-label="Memory explanation"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <button type="button" className="btn btn-sm mb-4 lg:hidden" onClick={() => selectMemory(null)}>
          <ArrowLeft aria-hidden className="inline size-4" /> All memories
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge memory={memory} />
          {memory.status === "candidate" && <span className="text-xs" style={{ color: "var(--ink-dim)" }}>Not confirmed by you</span>}
          {memory.modelReportedConfidence !== null && (
            <span className="text-xs" style={{ color: "var(--ink-dim)" }} title="Reported by the extracting model. Not calibrated.">
              Model-reported confidence {Math.round(memory.modelReportedConfidence * 100)}%
            </span>
          )}
        </div>
        <h2 className={`serif mt-3 text-2xl leading-tight ${memory.status === "deleted" ? "line-through opacity-60" : ""}`}>{memory.claim}</h2>

        {shownNotice && <p className="fade mt-3 text-sm font-medium" role="status" style={{ color: "var(--good)" }}>{shownNotice}</p>}
        {memory.status === "deleted" && (
          <div className="fade mt-3 flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 text-sm" role="status" style={{ background: "var(--paper-2)" }}>
            Forgotten. The AI no longer uses this in its replies.
            <button type="button" className="btn btn-sm" onClick={() => restore(memory.id)}><Undo2 aria-hidden className="inline size-3.5" /> Undo</button>
          </div>
        )}
        {memory.status === "superseded" && (
          <p className="mt-3 text-sm" style={{ color: "var(--ink-dim)" }}>This is an earlier version. It was replaced and is no longer used.</p>
        )}

        {active && (
          <div className="mt-4 flex flex-wrap gap-2">
            {memory.status === "candidate" && (
              <button type="button" className="btn" onClick={() => { approve(memory.id); setNotice({ id: memory.id, text: "Confirmed by you." }); }}>
                <Check aria-hidden className="inline size-4" /> Confirm
              </button>
            )}
            <button type="button" className="btn" aria-expanded={editing} onClick={() => { setDraft(memory.claim); setEditing(!editing); }}>
              <Pencil aria-hidden className="inline size-4" /> Correct
            </button>
            <button type="button" className="btn btn-danger" onClick={() => { deleteMemory(memory.id); setEditing(false); }}>
              <Trash2 aria-hidden className="inline size-4" /> Forget
            </button>
          </div>
        )}
        {editing && active && (
          <form className="fade mt-3" onSubmit={(event) => { event.preventDefault(); saveCorrection(); }}>
            <label className="text-sm font-medium" htmlFor="correct-claim">What should the AI remember instead?</label>
            <textarea
              id="correct-claim"
              autoFocus
              value={draft}
              maxLength={500}
              rows={2}
              className="mt-1.5 w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-[15px]"
              style={{ borderColor: "var(--accent)" }}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); saveCorrection(); }
              }}
            />
            <div className="mt-2 flex gap-2">
              <button type="submit" className="btn btn-solid" disabled={!draft.trim() || draft.trim() === memory.claim}>Save correction</button>
              <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </form>
        )}

        <h3 className="kicker mt-7">Why the AI believes this</h3>
        <p className="mt-1.5 text-[15px] leading-6">
          {userCorrected && prior
            ? `You corrected this. It replaces “${prior.claim}” and the AI uses your wording from now on.`
            : why(memory, evidence.sources.length)}
        </p>

        <h3 className="kicker mt-6">{userCorrected ? "Evidence behind the earlier version" : "Supporting evidence"}</h3>
        {evidence.unavailable ? (
          <p className="mt-1.5 text-sm" style={{ color: "var(--ink-dim)" }}>The source message is no longer stored, so the evidence can’t be shown.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {evidence.sources.map((message) => (
              <li key={message.id} className="quote">
                <span className="block text-xs" style={{ color: "var(--ink-dim)" }}>You said · {day(message.createdAt)}</span>
                <span className="mt-0.5 block">{highlight(message.content, evidence.quotes)}</span>
              </li>
            ))}
          </ul>
        )}

        {memory.kind === "inference" && (
          <>
            <h3 className="kicker mt-6">The AI’s interpretation</h3>
            <p className="mt-1.5 text-[15px] leading-6">
              The highlighted words are what you said. “{memory.claim}” is the AI’s reading of them, not a fact you stated.
              {type === "Uncertain" && " The evidence is thin, so this is the memory to check first."}
            </p>
            {parents.length > 0 && (
              <p className="mt-2 text-sm" style={{ color: "var(--ink-dim)" }}>It builds on: {parents.map((parent) => `“${parent.claim}”`).join(", ")}</p>
            )}
            <p className="mt-2 text-xs" style={{ color: "var(--ink-dim)" }}>This is the stored link between evidence and memory, not the model’s hidden reasoning.</p>
          </>
        )}

        {chain.length > 1 && (
          <>
            <h3 className="kicker mt-6">How this memory changed</h3>
            <ol className="mt-2 space-y-1.5 text-sm">
              {chain.map((version) => (
                <li key={version.id} className={version.id === memory.id ? "font-medium" : "line-through"} style={version.id === memory.id ? undefined : { color: "var(--ink-dim)" }}>
                  <span className="mr-2 text-xs no-underline" style={{ color: "var(--ink-dim)" }}>{day(version.createdAt)}</span>
                  {version.claim}
                </li>
              ))}
            </ol>
          </>
        )}

        <div className="mt-6 border-t pt-4" style={{ borderColor: "var(--line)" }}>
          <button type="button" className="btn btn-sm" aria-expanded={graph} onClick={() => setGraph(!graph)}>
            <Network aria-hidden className="inline size-3.5" /> {graph ? "Hide connections" : "View connections"}
          </button>
          {graph && <div className="mt-3"><Connections memory={memory} sources={evidence.sources} parents={parents} /></div>}
        </div>
      </div>
    </section>
  );
}
