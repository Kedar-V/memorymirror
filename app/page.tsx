"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Download, Eye, GitBranch, Moon, Pencil, Sun, Timer } from "lucide-react";
import { BeliefCards, ProfileSummary } from "@/components/BeliefBoard";
import ChatPanel from "@/components/ChatPanel";
import CounterfactualLab from "@/components/CounterfactualLab";
import EvaluationDashboard from "@/components/EvaluationDashboard";
import ImportFlow from "@/components/ImportFlow";
import ProfileCard from "@/components/ProfileCard";
import { personas } from "@/lib/demo-personas";
import { useMemoryStore } from "@/lib/memory-store";

const MemoryExplorer = dynamic(() => import("@/components/MemoryExplorer"), {
  ssr: false,
  loading: () => <p className="p-4 text-sm" style={{ color: "var(--ink-dim)" }}>Loading the explorer.</p>,
});

const MemoryGraph = dynamic(() => import("@/components/MemoryGraph"), {
  ssr: false,
  loading: () => (
    <p className="p-4 text-sm" style={{ color: "var(--ink-dim)" }}>
      Loading connections.
    </p>
  ),
});

export default function Page() {
  const hydrated = useMemoryStore((state) => state.hydrated);
  const theme = useMemoryStore((state) => state.theme);
  const personaId = useMemoryStore((state) => state.personaId);
  const fixtureMode = useMemoryStore((state) => state.fixtureMode);
  const destination = useMemoryStore((state) => state.destination);
  const setDestination = useMemoryStore((state) => state.setDestination);
  const setTheme = useMemoryStore((state) => state.setTheme);
  const loadPersona = useMemoryStore((state) => state.loadPersona);
  const reset = useMemoryStore((state) => state.reset);
  const selectMemory = useMemoryStore((state) => state.selectMemory);
  const dirty = useMemoryStore((state) => state.dirty);
  const [graphOpen, setGraphOpen] = useState(false);

  useEffect(() => {
    if (useMemoryStore.persist.hasHydrated()) useMemoryStore.setState({ hydrated: true });
    return useMemoryStore.persist.onFinishHydration(() => {
      useMemoryStore.setState({ hydrated: true });
    });
  }, []);

  useEffect(() => {
    if (hydrated) document.documentElement.dataset.theme = theme;
  }, [theme, hydrated]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      selectMemory(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectMemory]);

  function exportSession() {
    const state = useMemoryStore.getState();
    const blob = new Blob(
      [
        JSON.stringify(
          {
            personaId: state.personaId,
            messages: state.messages,
            memories: state.memories,
            exportedAt: new Date().toISOString(),
            note: "Local export. MemoryMirror does not upload this file.",
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `memorymirror-${state.personaId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!hydrated) {
    return (
      <main className="grid min-h-dvh place-items-center px-6 text-center">
        <p className="text-sm" style={{ color: "var(--ink-dim)" }}>Loading the session stored in this browser.</p>
      </main>
    );
  }

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-[var(--panel)] focus:p-2">
        Skip to profile
      </a>
      <header className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-4 pt-6">
        <div>
          <p className="kicker">Your AI’s memory</p>
          <h1 className="serif text-4xl leading-none">MemoryMirror</h1>
        </div>
        <nav className="flex flex-wrap items-center gap-2" aria-label="Sections">
          <button type="button" className="btn" aria-pressed={destination === "home"} onClick={() => setDestination("home")}>Home</button>
          <button type="button" className="btn" aria-pressed={destination === "explorer"} onClick={() => setDestination("explorer")}>Memory Explorer</button>
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="persona">Person</label>
          <select
            id="persona"
            className="glass-pill bg-transparent px-3 py-1.5 text-sm"
            value={personaId}
            onChange={(event) => {
              const next = event.target.value;
              if (next === personaId) return;
              if (dirty() && !window.confirm("Switch person? This person's edits stay saved in this browser.")) return;
              loadPersona(next);
            }}
          >
            {personas.map((persona) => (
              <option key={persona.id} value={persona.id}>{persona.name}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (dirty() && !window.confirm("Reset this person to the starting session?")) return;
              reset();
            }}
          >
            Reset
          </button>
          <button type="button" className="btn" onClick={exportSession}>
            <Download aria-hidden className="inline size-4" /> Export
          </button>
          <button
            type="button"
            className="btn"
            aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"}
            aria-pressed={theme === "dark"}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun aria-hidden className="size-4" /> : <Moon aria-hidden className="size-4" />}
          </button>
        </div>
      </header>
      <section className="mx-auto mt-4 max-w-6xl px-4" aria-label="Introduction">
        <div className="glass px-5 py-6">
          <p className="max-w-2xl text-lg leading-7">Your AI remembers you. But can you see, challenge, and change what it believes?</p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <li className="glass-tile"><Eye aria-hidden className="mb-1 size-4" /><span className="block text-sm font-semibold">Transparency</span><span className="mt-0.5 block text-xs leading-5" style={{ color: "var(--ink-dim)" }}>See where memories come from</span></li>
            <li className="glass-tile"><Pencil aria-hidden className="mb-1 size-4" /><span className="block text-sm font-semibold">Controllability</span><span className="mt-0.5 block text-xs leading-5" style={{ color: "var(--ink-dim)" }}>Correct and delete what is wrong</span></li>
            <li className="glass-tile"><Timer aria-hidden className="mb-1 size-4" /><span className="block text-sm font-semibold">Temporal understanding</span><span className="mt-0.5 block text-xs leading-5" style={{ color: "var(--ink-dim)" }}>Track how memories change</span></li>
            <li className="glass-tile"><GitBranch aria-hidden className="mb-1 size-4" /><span className="block text-sm font-semibold">Behavioral impact</span><span className="mt-0.5 block text-xs leading-5" style={{ color: "var(--ink-dim)" }}>Test how memories change replies</span></li>
          </ul>
        </div>
        {destination === "home" && (
          <article className="card mt-4">
            <h2 className="text-lg font-semibold">What is MemoryMirror?</h2>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--ink-dim)" }}>
              A memory record you can read. Every belief stays tied to a message, and you can change what the assistant uses.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a className="btn" href="#profile">See what your AI knows</a>
              <button type="button" className="btn" onClick={() => setDestination("explorer")}>Understand why it knows</button>
              <a className="btn" href="#beliefs">Correct or delete beliefs</a>
              <a className="btn" href="#lab">Test the impact</a>
            </div>
          </article>
        )}
      </section>
      <p className="mx-auto mt-4 max-w-6xl px-4 text-sm leading-6" style={{ color: "var(--ink-dim)" }}>
        Stored in this browser only. Switching people is a local demo, not a login. A message, a comparison, or the benchmark is sent to this app’s server, and to Cursor only if a server key is set.
        {fixtureMode === true && " The latest result was a simulated example."}
        {fixtureMode === false && " The latest result was model-generated."}
      </p>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6">
      {destination === "explorer" ? <MemoryExplorer /> : (
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6 lg:col-start-1">
          <ImportFlow />
          <ProfileCard />
          <ProfileSummary />
        </div>
        <div className="lg:sticky lg:top-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <ChatPanel />
        </div>
        <div id="beliefs" className="space-y-10">
          <BeliefCards />
          <CounterfactualLab />
          <details
            className="card"
            onToggle={(event) => setGraphOpen((event.currentTarget as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer text-lg font-semibold">Explore connections</summary>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--ink-dim)" }}>
              A map of the same beliefs. Click one to highlight the message it came from.
            </p>
            {graphOpen && (
              <div className="mt-4 h-[520px]">
                <MemoryGraph />
              </div>
            )}
          </details>
          <details className="card">
            <summary className="cursor-pointer text-lg font-semibold">Research benchmark</summary>
            <div className="mt-4">
              <EvaluationDashboard />
            </div>
          </details>
          <section className="card" aria-label="Project notes">
            <h2 className="text-lg font-semibold">Project notes</h2>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--ink-dim)" }}>
              These are notes about the demo, not measured results. You can see, correct, and delete a belief. The time view uses the dates stored on each record. The lab shows what changed in one prompt, not a cause beyond that prompt. Live replies use a local Cursor agent, and deleting a belief cannot undo a request that already left this browser.
            </p>
          </section>
        </div>
      </div>
      )}
      </main>
    </div>
  );
}
