"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { FlaskConical, MessageCircle, RotateCcw, X } from "lucide-react";
import ChatPanel from "@/components/ChatPanel";
import CounterfactualLab from "@/components/CounterfactualLab";
import EvaluationDashboard from "@/components/EvaluationDashboard";
import ImportFlow, { StoredData } from "@/components/ImportFlow";
import MemoryDetail from "@/components/MemoryDetail";
import MemoryList from "@/components/MemoryList";
import StaticNotice from "@/components/StaticNotice";
import { STATIC_DEMO } from "@/lib/client-api";
import { getPersona, personas } from "@/lib/demo-personas";
import { useMemoryStore } from "@/lib/memory-store";

const MemoryExplorer = dynamic(() => import("@/components/MemoryExplorer"), {
  ssr: false,
  loading: () => <p className="p-4 text-sm" style={{ color: "var(--ink-dim)" }}>Loading the map.</p>,
});

const RESEARCH = [
  { id: "compare", label: "Compare answers", note: "Send one question with the original, corrected, and removed memory, and compare the replies." },
  { id: "map", label: "Full memory map", note: "Every memory, earlier version, and source message for this profile." },
  { id: "benchmark", label: "Benchmark", note: "Twelve corrected-record cases scored with a substring rubric." },
  { id: "data", label: "Your data", note: "What is stored and how to delete it." },
] as const;

type ResearchTab = (typeof RESEARCH)[number]["id"];

function Research({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<ResearchTab>("compare");
  const current = RESEARCH.find((item) => item.id === tab)!;
  return (
    <div className="fade fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(20,20,30,0.25)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Research details"
        className="slide-in flex h-full w-full max-w-5xl flex-col"
        style={{ background: "var(--paper)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b px-6 py-4" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
          <div>
            <h2 className="serif text-lg">Research details</h2>
            <p className="text-xs" style={{ color: "var(--ink-dim)" }}>{current.note}</p>
          </div>
          <button type="button" className="btn btn-sm" aria-label="Close research details" onClick={onClose}><X aria-hidden className="size-4" /></button>
        </header>
        <nav className="flex gap-1 border-b px-6 py-2" style={{ borderColor: "var(--line)", background: "var(--panel)" }} aria-label="Research sections">
          {RESEARCH.map((item) => (
            <button key={item.id} type="button" className="btn btn-sm" aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {tab === "compare" && <CounterfactualLab />}
          {tab === "map" && <MemoryExplorer />}
          {tab === "benchmark" && <EvaluationDashboard />}
          {tab === "data" && <StoredData />}
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const hydrated = useMemoryStore((state) => state.hydrated);
  const destination = useMemoryStore((state) => state.destination);
  const personaId = useMemoryStore((state) => state.personaId);
  const sessions = useMemoryStore((state) => state.sessions);
  const setDestination = useMemoryStore((state) => state.setDestination);
  const loadPersona = useMemoryStore((state) => state.loadPersona);
  const reset = useMemoryStore((state) => state.reset);
  const selectMemory = useMemoryStore((state) => state.selectMemory);
  const dirty = useMemoryStore((state) => state.dirty);
  const [chat, setChat] = useState<{ initial?: string } | null>(null);
  const [ask, setAsk] = useState("");
  const [research, setResearch] = useState(false);
  const persona = getPersona(personaId);
  const choices = personas.filter((item) => item.id !== "sample" && (item.id !== "imported" || sessions.imported?.messages.length));

  useEffect(() => {
    if (useMemoryStore.persist.hasHydrated()) useMemoryStore.setState({ hydrated: true });
    return useMemoryStore.persist.onFinishHydration(() => useMemoryStore.setState({ hydrated: true }));
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (research) return setResearch(false);
      if (chat) return setChat(null);
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") selectMemory(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [research, chat, selectMemory]);

  useEffect(() => {
    if (destination !== "workspace") { setResearch(false); setChat(null); }
  }, [destination]);

  if (!hydrated) {
    return <main className="grid min-h-dvh place-items-center text-sm" style={{ color: "var(--ink-dim)" }}>Loading…</main>;
  }

  const workspace = destination === "workspace";

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-[57px] shrink-0 items-center justify-between gap-4 border-b px-6" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
        <button type="button" className="flex items-center gap-2.5 text-left" onClick={() => setDestination("start")} aria-label="MemoryMirror home">
          <span className="grid size-7 place-items-center rounded-lg text-sm font-bold text-white" style={{ background: "var(--accent)" }} aria-hidden>M</span>
          <span>
            <span className="serif block text-[15px] leading-tight">MemoryMirror</span>
            <span className="block text-xs leading-tight" style={{ color: "var(--ink-dim)" }}>See what AI remembers. Understand why.</span>
          </span>
        </button>
        {workspace && (
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="persona">Profile</label>
            <select
              id="persona"
              className="btn btn-sm hidden sm:block"
              value={personaId}
              onChange={(event) => {
                const next = event.target.value;
                if (next !== personaId) loadPersona(next);
              }}
            >
              {choices.map((item) => (
                <option key={item.id} value={item.id}>{item.id === "demo" ? `${item.name} (sample)` : item.id === "imported" ? "Your upload" : `${item.name} (demo)`}</option>
              ))}
            </select>
            {persona.messages.length > 0 && <button
              type="button"
              className="btn btn-sm"
              title="Restore this profile to its starting state"
              onClick={() => {
                if (dirty() && !window.confirm("Undo every correction and new message for this profile?")) return;
                reset();
              }}
            >
              <RotateCcw aria-hidden className="inline size-3.5" /> Reset
            </button>}
            <button type="button" className="btn btn-sm" onClick={() => setResearch(true)}>
              <FlaskConical aria-hidden className="inline size-3.5" /> Research details
            </button>
          </div>
        )}
      </header>

      {!workspace ? (
        <div className="min-h-0 flex-1 overflow-y-auto"><ImportFlow /></div>
      ) : (
        <main className="fade mx-auto flex min-h-0 w-full max-w-[1320px] flex-1 flex-col px-6 pt-5">
          {persona.id === "demo" && (
            <p className="mb-3 text-xs" style={{ color: "var(--ink-dim)" }}>
              Sample conversation with {persona.name}. These memories are pre-written sample data. {STATIC_DEMO ? "Chat replies are simulated from them." : "Chat replies are generated live from them, and any simulated reply is labeled."}
            </p>
          )}
          {STATIC_DEMO && <div className="mb-3"><StaticNotice /></div>}
          <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[45fr_55fr]">
            <MemoryList />
            <MemoryDetail />
          </div>
          <form
            className="mx-auto my-4 flex w-full max-w-2xl items-center gap-2 rounded-full border px-4 py-2"
            style={{ borderColor: "var(--line)", background: "var(--panel)", boxShadow: "var(--shadow)" }}
            onSubmit={(event) => {
              event.preventDefault();
              setChat({ initial: ask.trim() || undefined });
              setAsk("");
            }}
          >
            <MessageCircle aria-hidden className="size-4 shrink-0" style={{ color: "var(--accent)" }} />
            <label className="sr-only" htmlFor="ask">Ask the AI something about you</label>
            <input
              id="ask"
              value={ask}
              onChange={(event) => setAsk(event.target.value)}
              placeholder="Ask the AI something about you…"
              className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none"
            />
            <button type="submit" className="btn btn-sm btn-solid">{ask.trim() ? "Ask" : "Open chat"}</button>
          </form>
        </main>
      )}

      {chat && <ChatPanel key={chat.initial ?? "open"} initial={chat.initial} onClose={() => setChat(null)} />}
      {research && <Research onClose={() => setResearch(false)} />}
    </div>
  );
}
