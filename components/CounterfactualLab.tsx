"use client";

import { useState } from "react";
import Markdown from "@/components/Markdown";
import { postJson } from "@/lib/client-api";
import { getPersona, promptFromMemories } from "@/lib/demo-personas";
import { activePrompt, useMemoryStore } from "@/lib/memory-store";
import { counterfactualLists, phraseTakeaway } from "@/lib/lineage";
import { chainHeads, kindLabel, statusLabel } from "@/lib/present";
import type { PromptMemory } from "@/lib/schemas";

type Arm = {
  reply: string;
  simulated: boolean;
  model: string;
  temperature: number | null;
};

function MemoryList({ memories }: { memories: PromptMemory[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {memories.map((memory) => (
        <li key={memory.id} className="text-sm leading-6">
          <span className="text-xs" style={{ color: "var(--ink-dim)" }}>
            {kindLabel(memory.kind)} · {statusLabel(memory.status)}
          </span>
          <span className="mt-0.5 block">{memory.claim}</span>
        </li>
      ))}
    </ul>
  );
}

export default function CounterfactualLab() {
  const personaId = useMemoryStore((state) => state.personaId);
  const memories = useMemoryStore((state) => state.memories);
  const persona = getPersona(personaId);
  const heads = chainHeads(memories);
  const [focus, setFocus] = useState("");
  const [dropDependents, setDropDependents] = useState(false);
  const [useCurrent, setUseCurrent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arms, setArms] = useState<{ original: Arm; corrected: Arm; without: Arm; counts: number[] } | null>(null);
  const current = activePrompt(memories);
  const focusedMemory = memories.find((memory) => memory.id === focus);
  const focused = focus ? counterfactualLists(memories, focus, focusedMemory?.claim ?? "", dropDependents) : null;
  const beforeMemories = focused ? focused.original : promptFromMemories(persona.memories);
  const afterMemories = focused ? focused.corrected : useCurrent ? current : persona.corrected;
  const withoutMemories = focused ? focused.without : beforeMemories.filter((memory) => memory.kind === "explicit");
  const same = JSON.stringify(beforeMemories) === JSON.stringify(afterMemories) && JSON.stringify(beforeMemories) === JSON.stringify(withoutMemories);

  async function run() {
    if (same) return;
    setBusy(true);
    setError(null);
    const messages = [{ id: `${persona.id}-lab`, role: "user" as const, content: persona.question }];
    try {
      const [original, corrected, without] = await Promise.all([
        postJson<Arm>("/api/chat", { messages, memories: beforeMemories }),
        postJson<Arm>("/api/chat", { messages, memories: afterMemories }),
        postJson<Arm>("/api/chat", { messages, memories: withoutMemories }),
      ]);
      setArms({
        original,
        corrected,
        without,
        counts: [beforeMemories.length, afterMemories.length, withoutMemories.length],
      });
    } catch (runError) {
      setArms(null);
      setError(runError instanceof Error ? runError.message : "The comparison failed.");
    } finally {
      setBusy(false);
    }
  }

  const takeaway = arms
    ? phraseTakeaway(persona.watch, [
        { name: "Original", text: arms.original.reply },
        { name: "Corrected", text: arms.corrected.reply },
        { name: "Without", text: arms.without.reply },
      ])
    : "";

  return (
    <section id="lab" className="space-y-4" aria-label="Does memory change the answer?">
      <header>
        <h2 className="serif text-3xl leading-tight">Does memory change the answer?</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6" style={{ color: "var(--ink-dim)" }}>
          {persona.name} is asked the same question both times: “{persona.question}” Both answers use the same model and the same settings. Only the memories change. A phrase in one answer is not proof of a cause beyond that change.
        </p>
      </header>
      <label className="block text-sm">
        Compare
        <select
          className="mt-1 block w-full rounded-xl border bg-transparent px-3 py-2"
          style={{ borderColor: "var(--line)" }}
          value={focus}
          onChange={(event) => {
            setFocus(event.target.value);
            setDropDependents(false);
            setArms(null);
          }}
        >
          <option value="">The original record and a corrected record</option>
          {heads.map((memory) => (
            <option key={memory.id} value={memory.id}>{memory.claim}</option>
          ))}
        </select>
      </label>
      {focusedMemory?.kind === "inference" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={dropDependents} onChange={(event) => { setDropDependents(event.target.checked); setArms(null); }} />
          Also leave out assumptions drawn from the same message
        </label>
      )}
      {!focus && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useCurrent}
            onChange={(event) => {
              setUseCurrent(event.target.checked);
              setArms(null);
            }}
          />
          Use my current memories on the right
        </label>
      )}
      <div className="grid gap-3 lg:grid-cols-3">
        <article className="card">
          <h3 className="text-sm font-semibold">Original memory</h3>
          <p className="text-xs" style={{ color: "var(--ink-dim)" }}>Uses {beforeMemories.length} memories</p>
          <MemoryList memories={beforeMemories} />
        </article>
        <article className="card">
          <h3 className="text-sm font-semibold">Corrected memory</h3>
          <p className="text-xs" style={{ color: "var(--ink-dim)" }}>Uses {afterMemories.length} memories</p>
          <MemoryList memories={afterMemories} />
        </article>
        <article className="card">
          <h3 className="text-sm font-semibold">Without this memory</h3>
          <p className="text-xs" style={{ color: "var(--ink-dim)" }}>Uses {withoutMemories.length} memories</p>
          <MemoryList memories={withoutMemories} />
        </article>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className="btn btn-solid" disabled={busy || same} onClick={() => void run()}>
          {busy ? "Comparing" : same ? "Correct this belief first" : "Compare answers"}
        </button>
        {busy && <span className="busy-bar w-24" aria-hidden />}
      </div>
      {error && <p role="alert" className="text-sm" style={{ color: "var(--bad)" }}>{error}</p>}
      {!arms && !busy && !error && !same && (
        <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
          No comparison yet. The two answers appear here.
        </p>
      )}
      {arms && (
        <>
          <p className="text-sm leading-6" role="status">
            {arms.original.simulated || arms.corrected.simulated || arms.without.simulated
              ? "Simulated example. No model was called. All three used the same fixture."
              : `Model-generated. ${arms.original.model}. Temperature is not set.`}
          </p>
          <p className="text-sm leading-6">{takeaway}</p>
          <div className="grid gap-3 lg:grid-cols-3">
            <Reply title="Original memory" arm={arms.original} count={arms.counts[0]} />
            <Reply title="Corrected memory" arm={arms.corrected} count={arms.counts[1]} />
            <Reply title="Without this memory" arm={arms.without} count={arms.counts[2]} />
          </div>
        </>
      )}
    </section>
  );
}

function Reply({ title, arm, count }: { title: string; arm: Arm; count: number }) {
  return (
    <article className="card">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs" style={{ color: "var(--ink-dim)" }}>Uses {count} memories</p>
      <p className="mt-1 text-xs font-medium" style={{ color: arm.simulated ? "var(--warn)" : "var(--good)" }}>
        {arm.simulated ? "Simulated example" : "Model-generated"}
      </p>
      <div className="mt-2">
        <Markdown text={arm.reply} />
      </div>
    </article>
  );
}
