"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import Markdown from "@/components/Markdown";
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

function stamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function ChatPanel() {
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
  const [phase, setPhase] = useState<"extract" | "chat" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dropped, setDropped] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const hit = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = hit.current ?? scroller.current?.lastElementChild;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [messages.length, selectedId, phase]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || phase) return;
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
    setPhase("extract");
    try {
      const extracted = await postJson<ExtractReply>("/api/extract", {
        messages: wireMessages([...useMemoryStore.getState().messages]),
      });
      addMemories(extracted.memories);
      setDropped(extracted.dropped);
      setFixtureMode(extracted.simulated);
    } catch (extractError) {
      setError(extractError instanceof Error ? extractError.message : "Extraction failed.");
    }
    setPhase("chat");
    try {
      const snapshot = useMemoryStore.getState();
      const memories = snapshot.personalize ? activePrompt(snapshot.memories) : [];
      const reply = await postJson<ChatReply>("/api/chat", {
        messages: wireMessages(snapshot.messages),
        memories,
      });
      addMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: reply.reply,
        createdAt: new Date().toISOString(),
        simulated: reply.simulated,
        usedMemoryIds: memories.map((memory) => memory.id),
      });
      setFixtureMode(reply.simulated);
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "The reply failed.");
    } finally {
      setPhase(null);
    }
  }

  return (
    <section className="panel flex max-h-[70dvh] flex-col lg:max-h-[calc(100dvh-2rem)]" aria-label="Conversation" aria-busy={!!phase}>
      <header className="border-b px-4 py-4" style={{ borderColor: "var(--line)" }}>
        <p className="kicker">{persona.role}</p>
        <h2 className="serif text-2xl leading-tight">Talk with {persona.name}</h2>
        <p className="mt-1 text-sm leading-6" style={{ color: "var(--ink-dim)" }}>
          Replies use this person's beliefs unless you turn that off.
        </p>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={personalize} onChange={(event) => setPersonalize(event.target.checked)} />
          Use memories for replies
        </label>
      </header>
      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" role="log" aria-live="polite">
        {messages.length === 0 && (
          <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
            No messages yet. Ask something, or load a persona.
          </p>
        )}
        {messages.map((message) => {
          const marked = sourceIds.has(message.id);
          return (
            <article
              key={message.id}
              ref={marked ? hit : undefined}
              className={`rise rounded-md px-3 py-2 ${marked ? "msg-hit" : ""}`}
              style={{ background: marked ? undefined : "transparent" }}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="mono text-[11px] tracking-wide" style={{ color: "var(--ink-dim)" }}>
                  {message.role === "user" ? persona.name : "Assistant"} · {stamp(message.createdAt)}
                </span>
                {message.simulated && (
                  <span className="text-[11px] font-medium" style={{ color: "var(--warn)" }}>
                    Simulated example
                  </span>
                )}
                {marked && (
                  <span className="mono text-[11px]" style={{ color: "var(--info)" }}>
                    Source
                  </span>
                )}
              </div>
              {message.role === "assistant" ? (
                <Markdown text={message.content} />
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
              )}
            </article>
          );
        })}
        {phase && (
          <article className="rise rounded-md px-3 py-2" role="status">
            <p className="mono text-[11px] tracking-wide" style={{ color: "var(--ink-dim)" }}>Assistant</p>
            <p className="mt-1 text-sm leading-6">
              {phase === "extract" ? "Waiting on Cursor to read this message for memories." : "Waiting on Cursor for a reply."}
            </p>
            <span className="busy-bar mt-2 block w-full" aria-hidden />
          </article>
        )}
      </div>
      <div className="border-t px-4 py-3" style={{ borderColor: "var(--line)" }}>
        {error && (
          <p className="mb-2 text-sm" role="alert" style={{ color: "var(--bad)" }}>{error}</p>
        )}
        {dropped > 0 && (
          <p className="mb-2 text-sm" role="status" style={{ color: "var(--warn)" }}>
            Sensitivity filter withheld {dropped} candidate {dropped === 1 ? "memory" : "memories"}.
          </p>
        )}
        <div className="mb-2 flex flex-wrap gap-2">
          {persona.suggested.map((prompt) => (
            <button key={prompt} type="button" className="chip text-sm" disabled={!!phase} onClick={() => send(prompt)}>
              {prompt}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor="composer">Message</label>
          <textarea
            id="composer"
            value={draft}
            maxLength={4000}
            rows={2}
            placeholder="Write a message. Enter sends. Shift+Enter adds a line."
            className="min-h-16 flex-1 resize-none rounded-md border bg-transparent px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)" }}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(draft);
              }
            }}
          />
          <button type="button" className="btn btn-solid" disabled={!!phase || !draft.trim()} onClick={() => send(draft)}>
            <Send aria-hidden className="inline size-4" /> {phase ? "Waiting" : "Send"}
          </button>
        </div>
        {draft.length > 3500 && (
          <p className="mono mt-1 text-[11px]" style={{ color: "var(--ink-dim)" }}>{draft.length}/4000</p>
        )}
      </div>
    </section>
  );
}
