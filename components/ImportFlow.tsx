"use client";

import { useRef, useState } from "react";
import { ArrowRight, FileText, MessageSquare, Quote, Sparkles, Upload } from "lucide-react";
import { getJson, postJson } from "@/lib/client-api";
import { useMemoryStore } from "@/lib/memory-store";
import { dateSpan, parseTranscript, selectedMessages, IMPORT_MESSAGE_CAP, type ParsedConversation } from "@/lib/parse-transcript";
import { reconcile } from "@/lib/reconcile";
import type { ChatMessage, ExtractedRelation, Memory } from "@/lib/schemas";

type Provider = { provider: "fixture" | "cursor"; model: string };

const ACCEPT = ".json,.txt,.csv,text/plain,application/json";

export default function ImportFlow() {
  const installSession = useMemoryStore((state) => state.installSession);
  const loadPersona = useMemoryStore((state) => state.loadPersona);
  const reset = useMemoryStore((state) => state.reset);
  const setDestination = useMemoryStore((state) => state.setDestination);
  const setFixtureMode = useMemoryStore((state) => state.setFixtureMode);
  const [parsed, setParsed] = useState<ParsedConversation[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  function trySample() {
    loadPersona("demo");
    reset();
    setDestination("workspace");
  }

  async function readFile(file: File) {
    setError(null);
    if (!/\.(json|txt|csv)$/i.test(file.name)) {
      setError("Use a ChatGPT conversations.json export, a .txt transcript, a JSON conversation file, or a CSV with message, role, and timestamp columns.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("This file is over 8 MB. Choose a smaller export.");
      return;
    }
    const result = parseTranscript(await file.text(), file.name, `imp-${crypto.randomUUID()}`);
    setSkipped(result.skipped);
    if (!result.conversations.length) {
      setError("No conversations could be read from that file.");
      return;
    }
    setParsed(result.conversations);
    setPicked(result.conversations.map((item) => item.id));
    try {
      setProvider(await getJson<Provider>("/api/extract"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not check the model.");
    }
  }

  async function analyze() {
    const chosen = selectedMessages(parsed, picked);
    if (!chosen.length) {
      setError("Choose at least one conversation.");
      return;
    }
    const batches: ChatMessage[][] = [];
    for (let i = 0; i < chosen.length; i += 40) batches.push(chosen.slice(i, i + 40));
    const abort = new AbortController();
    abortRef.current = abort;
    setError(null);
    const memories: Memory[] = [];
    const relations: ExtractedRelation[] = [];
    try {
      for (let i = 0; i < batches.length; i += 1) {
        setProgress(batches.length > 1 ? `Reading part ${i + 1} of ${batches.length}…` : "Reading your conversation…");
        const result = await postJson<{ memories: Memory[]; relations?: ExtractedRelation[]; dropped: number; simulated: boolean }>("/api/extract", {
          messages: batches[i].map((message) => ({ id: message.id, role: message.role, content: message.content })),
        }, abort.signal);
        memories.push(...result.memories);
        relations.push(...(result.relations ?? []));
        setFixtureMode(result.simulated);
      }
      const saved = reconcile(memories, chosen, relations, "imported");
      installSession("imported", { messages: chosen, memories: saved.memories, relationships: saved.relationships, profileHistory: [] });
      if (useMemoryStore.getState().personaId !== "imported") setError("The import could not be saved.");
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) {
        setError(reason instanceof Error ? reason.message : "The import failed.");
      }
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  }

  const count = selectedMessages(parsed, picked).length;

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-57px)] max-w-3xl flex-col justify-center px-6 py-12">
      <div className="rise text-center">
        <h1 className="serif text-4xl leading-tight sm:text-5xl">Your AI remembers things about you.<br />Shouldn’t you know what?</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-7" style={{ color: "var(--ink-dim)" }}>
          Upload a conversation to discover what an AI remembers, where those memories came from, and how to correct them.
        </p>
      </div>

      {!parsed.length && (
        <div
          className="rise mt-10 rounded-2xl border-2 border-dashed p-8 text-center transition-colors"
          style={{ animationDelay: "80ms", borderColor: dragging ? "var(--accent)" : "var(--line)", background: dragging ? "var(--accent-soft)" : "var(--panel)" }}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files[0];
            if (file) void readFile(file);
          }}
        >
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" className="btn btn-solid px-5 py-2.5 text-base" onClick={trySample}>
              <Sparkles aria-hidden className="mr-1.5 inline size-4" /> Try sample conversation
            </button>
            <button type="button" className="btn px-5 py-2.5 text-base" onClick={() => fileInput.current?.click()}>
              <Upload aria-hidden className="mr-1.5 inline size-4" /> Upload conversation
            </button>
          </div>
          <input
            ref={fileInput}
            className="sr-only"
            type="file"
            accept={ACCEPT}
            aria-label="Conversation file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
              event.target.value = "";
            }}
          />
          <p className="mt-4 text-xs" style={{ color: "var(--ink-dim)" }}>Or drop a ChatGPT export, .txt, .json, or .csv here. It stays in this browser until you choose to analyze it.</p>
        </div>
      )}

      {parsed.length > 0 && (
        <div className="card rise mt-10 space-y-4">
          <div>
            <h2 className="serif text-lg">Choose what to analyze</h2>
            {skipped > 0 && <p className="text-sm" style={{ color: "var(--ink-dim)" }}>{skipped} unreadable records were skipped.</p>}
          </div>
          <ul className="max-h-56 space-y-2 overflow-y-auto">
            {parsed.map((conversation) => (
              <li key={conversation.id}>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={picked.includes(conversation.id)}
                    onChange={(event) => setPicked((current) => event.target.checked ? [...current, conversation.id] : current.filter((id) => id !== conversation.id))}
                  />
                  <span>
                    <span className="font-medium">{conversation.title || "Untitled conversation"}</span>
                    <span className="block" style={{ color: "var(--ink-dim)" }}>{conversation.messages.length} messages · {dateSpan(conversation.messages)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {provider && (
            <p className="text-xs leading-5" style={{ color: "var(--ink-dim)" }}>
              {count} messages will be sent to this app’s server (the first {IMPORT_MESSAGE_CAP} are analyzed).{" "}
              {provider.provider === "cursor"
                ? `A Cursor model (${provider.model}) will read them; the provider may keep the request under its own policy.`
                : "No model key is configured, so a local fixture extracts memories and no model is called."}
            </p>
          )}
          {progress ? (
            <div className="flex items-center gap-3 text-sm" role="status">
              <span>{progress}</span>
              <span className="busy-bar w-24" aria-hidden />
              <button type="button" className="btn btn-sm" onClick={() => abortRef.current?.abort()}>Cancel</button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-solid" disabled={!count || !provider} onClick={() => void analyze()}>Find memories</button>
              <button type="button" className="btn" onClick={() => { setParsed([]); setPicked([]); setProvider(null); }}>Back</button>
            </div>
          )}
        </div>
      )}

      {error && <p role="alert" className="mt-4 text-center text-sm" style={{ color: "var(--bad)" }}>{error}</p>}

      <ol className="rise mt-12 flex flex-wrap items-center justify-center gap-3 text-sm" style={{ animationDelay: "160ms", color: "var(--ink-dim)" }} aria-label="How it works">
        {[
          { icon: MessageSquare, label: "Conversation" },
          { icon: FileText, label: "Memory" },
          { icon: Quote, label: "Evidence" },
        ].map(({ icon: Icon, label }, index) => (
          <li key={label} className="flex items-center gap-3">
            {index > 0 && <ArrowRight aria-hidden className="size-4" />}
            <span className="flex items-center gap-2 rounded-full border px-3 py-1.5" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
              <Icon aria-hidden className="size-4" style={{ color: "var(--accent)" }} /> {label}
            </span>
          </li>
        ))}
      </ol>
    </main>
  );
}

export function StoredData() {
  const messages = useMemoryStore((state) => state.messages);
  const personaId = useMemoryStore((state) => state.personaId);
  const deleteConversation = useMemoryStore((state) => state.deleteConversation);
  const deleteBatch = useMemoryStore((state) => state.deleteBatch);
  const deleteDerived = useMemoryStore((state) => state.deleteDerived);
  const clearArchive = useMemoryStore((state) => state.clearArchive);
  const setDestination = useMemoryStore((state) => state.setDestination);
  const imported = messages.filter((message) => message.importBatchId);
  const batches = [...new Set(imported.map((message) => message.importBatchId).filter((id): id is string => Boolean(id)))];
  const conversations = [...new Map(imported.map((message) => [message.conversationId, message])).values()];

  function exportSession() {
    const state = useMemoryStore.getState();
    const blob = new Blob([JSON.stringify({
      personaId: state.personaId,
      messages: state.messages,
      memories: state.memories,
      exportedAt: new Date().toISOString(),
      note: "Local export. MemoryMirror does not upload this file.",
    }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `memorymirror-${state.personaId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function removeConversation(id: string | undefined) {
    if (!id) return;
    const cited = useMemoryStore.getState().memories.some((memory) =>
      memory.sourceMessageIds.some((source) => messages.some((message) => message.id === source && message.conversationId === id)),
    );
    const note = cited ? " Memories that cite these messages will keep their text, but the source will show as missing." : "";
    if (!window.confirm(`Delete this conversation from this browser?${note} This does not remove anything a model provider already kept.`)) return;
    deleteConversation(id);
  }

  return (
    <div className="space-y-4 text-sm leading-6">
      <p style={{ color: "var(--ink-dim)" }}>
        Everything is stored in this browser’s localStorage. There is no account and no database. A request leaves the browser only when you send a message, analyze an upload, run a comparison, or run the benchmark.
      </p>
      <button type="button" className="btn" onClick={exportSession}>Export this session as JSON</button>
      {(personaId === "imported" || personaId === "sample") && imported.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold">Imported conversations</h3>
          <ul className="space-y-1">
            {conversations.map((message) => (
              <li key={message.conversationId} className="flex flex-wrap items-center gap-2">
                {message.title || "Untitled conversation"}
                <button type="button" className="btn btn-sm" onClick={() => removeConversation(message.conversationId)}>Delete conversation</button>
              </li>
            ))}
          </ul>
          {batches.map((batchId) => (
            <div key={batchId} className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-sm" onClick={() => {
                if (!window.confirm("Delete this import’s messages from this browser? Memories that cite them will show a missing source. A provider may still have the text that was sent.")) return;
                deleteBatch(batchId);
              }}>Delete import batch</button>
              <button type="button" className="btn btn-sm" onClick={() => {
                if (!window.confirm("Forget memories extracted from this import? The messages stay. This does not erase data a provider already kept.")) return;
                deleteDerived(batchId);
              }}>Forget derived memories</button>
            </div>
          ))}
        </div>
      )}
      <button type="button" className="btn btn-danger" onClick={() => {
        if (!window.confirm("Clear every profile stored in this browser and restore the demo? This does not erase data a provider already kept.")) return;
        clearArchive();
        setDestination("start");
      }}>Clear all locally stored data</button>
    </div>
  );
}
