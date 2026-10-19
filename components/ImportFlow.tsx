"use client";

import { useRef, useState } from "react";
import { getJson, postJson } from "@/lib/client-api";
import { runSample } from "@/lib/import-fixture";
import { conflicts } from "@/lib/lineage";
import { useMemoryStore } from "@/lib/memory-store";
import { dateSpan, parseTranscript, selectedMessages, IMPORT_MESSAGE_CAP, type ParsedConversation } from "@/lib/parse-transcript";
import { needsReview } from "@/lib/present";
import { reconcile } from "@/lib/reconcile";
import type { ChatMessage, ExtractedRelation, Memory, Relationship } from "@/lib/schemas";

type Step = "start" | "preview" | "confirm" | "run" | "done";
type Counts = {
  conversations: number;
  messages: number;
  memories: number;
  explicit: number;
  assumptions: number;
  relationships: number;
  contradictions: number;
  review: number;
};
type Provider = { provider: "fixture" | "cursor"; model: string };

const ACCEPT = ".json,.txt,.csv,text/plain,application/json";

function countsFrom(messages: ChatMessage[], memories: Memory[], relationships: { status: string }[]): Counts {
  const active = memories.filter((memory) => memory.status === "approved" || memory.status === "candidate");
  return {
    conversations: new Set(messages.map((message) => message.conversationId).filter(Boolean)).size,
    messages: messages.length,
    memories: active.length,
    explicit: active.filter((memory) => memory.kind === "explicit").length,
    assumptions: active.filter((memory) => memory.kind === "inference").length,
    relationships: relationships.filter((item) => item.status === "active").length,
    contradictions: conflicts(memories).length,
    review: memories.filter(needsReview).length,
  };
}

export default function ImportFlow() {
  const installSession = useMemoryStore((state) => state.installSession);
  const deleteConversation = useMemoryStore((state) => state.deleteConversation);
  const deleteBatch = useMemoryStore((state) => state.deleteBatch);
  const deleteDerived = useMemoryStore((state) => state.deleteDerived);
  const clearArchive = useMemoryStore((state) => state.clearArchive);
  const setDestination = useMemoryStore((state) => state.setDestination);
  const setFixtureMode = useMemoryStore((state) => state.setFixtureMode);
  const messages = useMemoryStore((state) => state.messages);
  const personaId = useMemoryStore((state) => state.personaId);
  const [step, setStep] = useState<Step>("start");
  const [parsed, setParsed] = useState<ParsedConversation[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const imported = messages.filter((message) => message.importBatchId);
  const batches = [...new Set(imported.map((message) => message.importBatchId).filter((id): id is string => Boolean(id)))];
  const conversations = [...new Map(imported.map((message) => [message.conversationId, message])).values()];

  function finish(persona: "imported" | "sample", nextMessages: ChatMessage[], memories: Memory[], relationships: Relationship[]) {
    installSession(persona, { messages: nextMessages, memories, relationships, profileHistory: [] });
    const state = useMemoryStore.getState();
    if (state.personaId !== persona) {
      setError("The import could not be saved.");
      return;
    }
    setCounts(countsFrom(state.messages, state.memories, state.relationships));
    setStep("done");
    document.getElementById("profile")?.scrollIntoView({ behavior: "smooth" });
  }

  async function readFile(file: File) {
    setError(null);
    const name = file.name.toLowerCase();
    if (!/\.(json|txt|csv)$/.test(name)) {
      setError("Use a ChatGPT conversations.json export, a .txt transcript, a JSON conversation file, or a CSV with message, role, and timestamp columns.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("This file is over 8 MB. Choose a smaller export.");
      return;
    }
    const text = await file.text();
    const result = parseTranscript(text, file.name, `imp-${crypto.randomUUID()}`);
    if (!result.conversations.length) {
      setError("No conversations could be read from that file.");
      setSkipped(result.skipped);
      return;
    }
    setParsed(result.conversations);
    setSkipped(result.skipped);
    setPicked(result.conversations.map((item) => item.id));
    setStep("preview");
  }

  function loadSample() {
    setError(null);
    const sample = runSample();
    setFixtureMode(true);
    finish("sample", sample.messages, sample.memories, sample.relationships);
  }

  async function confirm() {
    setError(null);
    const chosen = selectedMessages(parsed, picked);
    if (!chosen.length) {
      setError("Choose at least one conversation.");
      return;
    }
    try {
      setProvider(await getJson<Provider>("/api/extract"));
      setStep("confirm");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not check the model.");
    }
  }

  async function analyze() {
    const chosen = selectedMessages(parsed, picked);
    const batches: ChatMessage[][] = [];
    for (let i = 0; i < chosen.length; i += 40) batches.push(chosen.slice(i, i + 40));
    const abort = new AbortController();
    abortRef.current = abort;
    setStep("run");
    setError(null);
    const memories: Memory[] = [];
    const relations: ExtractedRelation[] = [];
    try {
      for (let i = 0; i < batches.length; i += 1) {
        setProgress(`Batch ${i + 1} of ${batches.length}`);
        const result = await postJson<{ memories: Memory[]; relations?: ExtractedRelation[]; dropped: number; simulated: boolean }>("/api/extract", {
          messages: batches[i].map((message) => ({ id: message.id, role: message.role, content: message.content })),
        }, abort.signal);
        memories.push(...result.memories);
        relations.push(...(result.relations ?? []));
        setFixtureMode(result.simulated);
      }
      const saved = reconcile(memories, chosen, relations, "imported");
      finish("imported", chosen, saved.memories, saved.relationships);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") {
        setStep("confirm");
        setProgress("");
        return;
      }
      setError(reason instanceof Error ? reason.message : "The import failed.");
      setStep("confirm");
    } finally {
      abortRef.current = null;
    }
  }

  function removeConversation(id: string | undefined) {
    if (!id) return;
    const cited = useMemoryStore.getState().memories.some((memory) =>
      memory.sourceMessageIds.some((source) => messages.some((message) => message.id === source && message.conversationId === id)),
    );
    const note = cited
      ? " Memories that cite these messages will keep their text, but the source will show as missing."
      : "";
    if (!window.confirm(`Delete this conversation from this browser?${note} This does not remove anything a model provider already kept.`)) return;
    deleteConversation(id);
  }

  return (
    <section className="card" aria-label="Import your AI conversations">
      <p className="kicker">Import your AI conversations</p>
      <h2 className="serif mt-1 text-3xl leading-tight">Upload your conversation history</h2>
      <p className="mt-2 text-sm leading-6" style={{ color: "var(--ink-dim)" }}>
        Upload your conversation history to discover what an AI could learn about you, where those beliefs came from, and how they changed over time.
      </p>
      {step === "start" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-solid" onClick={() => setStep("preview")}>Import my conversations</button>
          <button type="button" className="btn" onClick={loadSample}>Explore a sample</button>
        </div>
      )}
      {step === "preview" && !parsed.length && (
        <div
          className="mt-4 rounded-xl border border-dashed p-6 text-sm"
          style={{ borderColor: "var(--line)" }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file) void readFile(file);
          }}
        >
          <p>Drop a file here, or choose one. ChatGPT conversations.json, .txt, JSON, and CSV are supported.</p>
          <input className="mt-3 block text-sm" type="file" accept={ACCEPT} onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readFile(file);
          }} />
          <button type="button" className="btn mt-3" onClick={() => setStep("start")}>Back</button>
        </div>
      )}
      {step === "preview" && parsed.length > 0 && (
        <div className="mt-4 space-y-3">
          <p className="text-sm">{skipped ? `${skipped} records were skipped.` : "Every readable message is listed below."}</p>
          <ul className="space-y-2">
            {parsed.map((conversation) => (
              <li key={conversation.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={picked.includes(conversation.id)}
                  aria-label={conversation.title || "Untitled conversation"}
                  onChange={(event) => setPicked((current) => event.target.checked ? [...current, conversation.id] : current.filter((id) => id !== conversation.id))}
                />
                <span>
                  <span className="font-semibold">{conversation.title || "Untitled conversation"}</span>
                  <span className="mt-0.5 block" style={{ color: "var(--ink-dim)" }}>
                    {conversation.messages.length} messages · {dateSpan(conversation.messages)}
                    {conversation.branchIds.length ? ` · ${conversation.branchIds.length} unused branches` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-solid" onClick={() => void confirm()}>Continue</button>
            <button type="button" className="btn" onClick={() => { setParsed([]); setPicked([]); }}>Choose another file</button>
          </div>
        </div>
      )}
      {step === "confirm" && provider && (
        <div className="mt-4 space-y-3 text-sm leading-6">
          <p>
            {selectedMessages(parsed, picked).length} messages will be sent to this app’s server for extraction.
            The first {IMPORT_MESSAGE_CAP} selected messages are analyzed.
            {provider.provider === "cursor"
              ? ` A Cursor model (${provider.model}) will read them. The provider may keep that request under its own retention policy.`
              : " No model key is configured, so the server will use a local fixture and will not call Cursor."}
            {" "}The API key stays on the server.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-solid" onClick={() => void analyze()}>Analyze these conversations</button>
            <button type="button" className="btn" onClick={() => setStep("preview")}>Back</button>
          </div>
        </div>
      )}
      {step === "run" && (
        <div className="mt-4 flex items-center gap-3 text-sm">
          <span>{progress || "Reading conversations."}</span>
          <button type="button" className="btn" onClick={() => abortRef.current?.abort()}>Cancel</button>
        </div>
      )}
      {step === "done" && counts && (
        <div className="mt-4 space-y-3">
          <p className="text-lg font-semibold">Your MemoryMirror is ready.</p>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            <li>{counts.conversations} conversations analyzed</li>
            <li>{counts.messages} messages processed</li>
            <li>{counts.memories} memories extracted</li>
            <li>{counts.explicit} explicit facts</li>
            <li>{counts.assumptions} AI assumptions</li>
            <li>{counts.relationships} relationships discovered</li>
            <li>{counts.contradictions} potential contradictions</li>
            <li>{counts.review} memories requiring review</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <a className="btn btn-solid" href="#profile">View my profile</a>
            <button type="button" className="btn" onClick={() => setDestination("explorer")}>Explore my memory graph</button>
            <a className="btn" href="#beliefs">Review AI assumptions</a>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm" style={{ color: "var(--accent)" }}>{error}</p>}
      {(personaId === "imported" || personaId === "sample") && imported.length > 0 && (
        <div className="mt-4 space-y-2 text-sm">
          <h3 className="font-semibold">Stored on this browser</h3>
          <ul className="space-y-1">
            {conversations.map((message) => (
              <li key={message.conversationId}>
                {message.title || "Untitled conversation"}
                <button type="button" className="btn ml-2" onClick={() => removeConversation(message.conversationId)}>Delete conversation</button>
              </li>
            ))}
          </ul>
          {batches.map((batchId) => (
            <div key={batchId} className="flex flex-wrap gap-2">
              <button type="button" className="btn" onClick={() => {
                if (!window.confirm("Delete this import’s messages from this browser? Memories that cite them will show a missing source. A provider may still have the text that was sent.")) return;
                deleteBatch(batchId);
              }}>Delete import batch</button>
              <button type="button" className="btn" onClick={() => {
                if (!window.confirm("Forget memories extracted from this import? The messages stay. This does not erase data a provider already kept.")) return;
                deleteDerived(batchId);
              }}>Delete derived memories</button>
            </div>
          ))}
          <button type="button" className="btn" onClick={() => {
            if (!window.confirm("Clear every person stored in this browser and restore the demo? This does not erase data a provider already kept.")) return;
            clearArchive();
            setStep("start");
            setCounts(null);
          }}>Clear all locally stored data</button>
        </div>
      )}
    </section>
  );
}
