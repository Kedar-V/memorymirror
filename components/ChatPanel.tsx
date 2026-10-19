"use client";

import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import Markdown from "@/components/Markdown";
import { TypeBadge } from "@/components/MemoryList";
import { postJson, wireMessages } from "@/lib/client-api";
import { getPersona } from "@/lib/demo-personas";
import { activePrompt, useMemoryStore } from "@/lib/memory-store";
import type { ChatMessage, Memory } from "@/lib/schemas";

type ExtractReply = {
  memories: Memory[];
  simulated: boolean;
  dropped: number;
};

type ChatReply = {
  reply: string;
  simulated: boolean;
  model: string;
  temperature: number | null;
};

export default function ChatPanel({ onClose, initial }: { onClose: () => void; initial?: string }) {
  const messages = useMemoryStore((state) => state.messages);
  const memories = useMemoryStore((state) => state.memories);
  const personaId = useMemoryStore((state) => state.personaId);
  const selectedId = useMemoryStore((state) => state.selectedMemoryId);
  const addMessage = useMemoryStore((state) => state.addMessage);
  const addMemories = useMemoryStore((state) => state.addMemories);
  const setFixtureMode = useMemoryStore((state) => state.setFixtureMode);
  const personalize = useMemoryStore((state) => state.personalize);
  const setPersonalize = useMemoryStore((state) => state.setPersonalize);
  const persona = getPersona(personaId);
  const selected = memories.find((memory) => memory.id === selectedId);
  const sourceIds = new Set(selected?.sourceMessageIds ?? []);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dropped, setDropped] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const sent = useRef(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.current?.lastElementChild?.scrollIntoView({ block: "end", behavior: reduce ? "auto" : "smooth" });
  }, [messages.length, busy]);

  useEffect(() => {
    if (initial && !sent.current) {
      sent.current = true;
      void send(initial);
    }
  });

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    addMessage(userMessage);
    setDraft("");
    setError(null);
    setDropped(0);
    setBusy(true);
    const snapshot = useMemoryStore.getState();
    const used = snapshot.personalize ? activePrompt(snapshot.memories) : [];
    const question = wireMessages([userMessage]);
    const [extracted, reply] = await Promise.allSettled([
      postJson<ExtractReply>("/api/extract", { messages: question }),
      postJson<ChatReply>("/api/chat", { messages: question, memories: used }),
    ]);
    if (extracted.status === "fulfilled") {
      addMemories(extracted.value.memories);
      setDropped(extracted.value.dropped);
      setFixtureMode(extracted.value.simulated);
    }
    if (reply.status === "fulfilled") {
      addMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: reply.value.reply,
        createdAt: new Date().toISOString(),
        simulated: reply.value.simulated,
        usedMemoryIds: used.map((memory) => memory.id),
      });
      setFixtureMode(reply.value.simulated);
    } else {
      setError(reply.reason instanceof Error ? reply.reason.message : "The reply failed.");
    }
    setBusy(false);
  }

  return (
    <aside
      className="slide-in fixed bottom-0 right-0 top-[57px] z-40 flex w-full max-w-[460px] flex-col border-l"
      style={{ background: "var(--panel)", borderColor: "var(--line)", boxShadow: "-12px 0 40px rgba(20,20,30,0.08)" }}
      aria-label="Ask the AI"
      aria-busy={busy}
    >
      <header className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--line)" }}>
        <div>
          <h2 className="serif text-lg">Ask the AI about you</h2>
          <p className="text-xs" style={{ color: "var(--ink-dim)" }}>Each question is answered from the stored memories only, not the raw transcript.</p>
          <label className="mt-1 flex items-center gap-2 text-xs" style={{ color: "var(--ink-dim)" }}>
            <input type="checkbox" checked={personalize} onChange={(event) => setPersonalize(event.target.checked)} />
            Use memories in replies
          </label>
        </div>
        <button type="button" className="btn btn-sm" aria-label="Close chat" onClick={onClose}><X aria-hidden className="size-4" /></button>
      </header>
      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4" role="log" aria-live="polite">
        {messages.map((message) => {
          const marked = sourceIds.has(message.id);
          const usedMemories = memories.filter((memory) => message.usedMemoryIds?.includes(memory.id));
          const mine = message.role === "user";
          return (
            <article key={message.id} className={`rise flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 ${marked ? "msg-hit" : ""}`}
                style={marked ? undefined : { background: mine ? "var(--accent-soft)" : "var(--paper-2)" }}
              >
                {mine ? <p className="whitespace-pre-wrap">{message.content}</p> : <Markdown text={message.content} />}
                {message.simulated && <p className="mt-1 text-[11px] font-medium" style={{ color: "var(--warn)" }}>Simulated reply, no model called</p>}
                {!mine && message.usedMemoryIds && (
                  <div className="mt-2 border-t pt-2" style={{ borderColor: "var(--line)" }}>
                    <p className="text-[11px]" style={{ color: "var(--ink-dim)" }}>
                      {usedMemories.length ? "Based on these memories:" : "No memories were used."}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {usedMemories.map((memory) => (
                        <li key={memory.id} className="flex flex-wrap items-center gap-1.5 text-xs">
                          <TypeBadge memory={memory} />
                          <span className={memory.status === "approved" || memory.status === "candidate" ? "" : "line-through opacity-60"}>{memory.claim}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </article>
          );
        })}
        {busy && (
          <div role="status" className="text-sm" style={{ color: "var(--ink-dim)" }}>
            Thinking…
            <span className="busy-bar mt-2 block w-24" aria-hidden />
          </div>
        )}
      </div>
      <div className="border-t px-5 py-3" style={{ borderColor: "var(--line)" }}>
        {error && <p className="mb-2 text-sm" role="alert" style={{ color: "var(--bad)" }}>{error}</p>}
        {dropped > 0 && (
          <p className="mb-2 text-xs" role="status" style={{ color: "var(--warn)" }}>
            The sensitivity filter withheld {dropped} possible {dropped === 1 ? "memory" : "memories"}.
          </p>
        )}
        {persona.suggested.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {persona.suggested.map((prompt) => (
              <button key={prompt} type="button" className="chip text-xs" disabled={busy} onClick={() => send(prompt)}>{prompt}</button>
            ))}
          </div>
        )}
        <form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); void send(draft); }}>
          <label className="sr-only" htmlFor="composer">Message</label>
          <textarea
            id="composer"
            autoFocus
            value={draft}
            maxLength={4000}
            rows={1}
            placeholder="Ask something about you…"
            className="min-h-10 flex-1 resize-none rounded-lg border bg-transparent px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)" }}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(draft);
              }
            }}
          />
          <button type="submit" className="btn btn-solid" aria-label="Send" disabled={busy || !draft.trim()}>
            <Send aria-hidden className="size-4" />
          </button>
        </form>
      </div>
    </aside>
  );
}
