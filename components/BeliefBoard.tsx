"use client";

import { useState } from "react";
import { getPersona } from "@/lib/demo-personas";
import { useMemoryStore, versionChain } from "@/lib/memory-store";
import {
  BUCKET_ORDER,
  categoryOf,
  chainHeads,
  isConfirmed,
  kindLabel,
  needsReview,
  statusLabel,
  verifiedEvidence,
} from "@/lib/present";
import type { Memory } from "@/lib/schemas";

function stamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ProfileSummary() {
  const personaId = useMemoryStore((state) => state.personaId);
  const memories = useMemoryStore((state) => state.memories);
  const name = getPersona(personaId).name.split(" ")[0];
  const approved = memories.filter((memory) => memory.status === "approved");
  const review = chainHeads(memories).filter(needsReview).length;

  return (
    <section className="card" aria-label="Profile">
      <p className="kicker">About {name}</p>
      <h2 className="serif mt-2 text-3xl leading-tight sm:text-4xl">
        Here’s what your AI thinks it knows about you.
      </h2>
      {approved.length === 0 ? (
        <p className="mt-4 text-sm leading-6" style={{ color: "var(--ink-dim)" }}>
          Nothing is confirmed yet. Talk in the conversation and new beliefs will show up here.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {approved.map((memory) => (
            <li key={memory.id} className="text-base leading-7">
              {memory.claim}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-sm leading-6" style={{ color: review ? "var(--warn)" : "var(--ink-dim)" }}>
        {review === 0
          ? "No guesses are waiting for review."
          : `${review} ${review === 1 ? "guess needs" : "guesses need"} a look before you trust ${review === 1 ? "it" : "them"}.`}
      </p>
    </section>
  );
}

export function BeliefCards() {
  const memories = useMemoryStore((state) => state.memories);
  const messages = useMemoryStore((state) => state.messages);
  const selectedId = useMemoryStore((state) => state.selectedMemoryId);
  const selectMemory = useMemoryStore((state) => state.selectMemory);
  const approve = useMemoryStore((state) => state.approve);
  const correct = useMemoryStore((state) => state.correct);
  const deleteMemory = useMemoryStore((state) => state.deleteMemory);
  const restore = useMemoryStore((state) => state.restore);
  const adoptClaim = useMemoryStore((state) => state.adoptClaim);
  const heads = chainHeads(memories);
  const review = heads.filter(needsReview);
  const confirmed = heads.filter(isConfirmed);
  const forgotten = memories.filter((memory) => memory.status === "deleted");
  const [whyId, setWhyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);

  function card(memory: Memory) {
    const selected = memory.id === selectedId;
    const open = whyId === memory.id;
    const editing = editingId === memory.id;
    const evidence = verifiedEvidence(memory, messages);
    const chain = versionChain(memories, memory.id);
    const canEdit = memory.status === "approved" || memory.status === "candidate";

    return (
      <article key={memory.id} className="card" data-selected={selected ? "true" : "false"}>
        <button
          type="button"
          className="w-full text-left"
          aria-pressed={selected}
          onClick={() => selectMemory(selected ? null : memory.id)}
        >
          <h3 className="text-lg leading-snug">{memory.claim}</h3>
        </button>
        <p className="mt-2 text-sm" style={{ color: "var(--ink-dim)" }}>
          <span className={memory.kind === "inference" ? "status-candidate" : "status-approved"}>{kindLabel(memory.kind)}</span>
          {" · "}
          <span className={needsReview(memory) ? "status-candidate" : "status-approved"}>{statusLabel(memory.status)}</span>
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            disabled={memory.status !== "candidate"}
            onClick={() => {
              approve(memory.id);
              selectMemory(memory.id);
              setNote("Confirmed. Future answers can use this.");
              setUndoId(null);
            }}
          >
            {memory.status === "candidate" ? "Yes" : "Already confirmed"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!canEdit}
            aria-expanded={editing}
            onClick={() => {
              selectMemory(memory.id);
              setDraft(memory.claim);
              setEditingId(editing ? null : memory.id);
            }}
          >
            Correct it
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              deleteMemory(memory.id);
              setUndoId(memory.id);
              setWhyId(null);
              setEditingId(null);
              setNote("Forgotten. It will not be used in future answers.");
            }}
          >
            Forget
          </button>
          <button
            type="button"
            className="btn"
            aria-expanded={open}
            onClick={() => {
              selectMemory(memory.id);
              setWhyId(open ? null : memory.id);
            }}
          >
            Why do you think this?
          </button>
        </div>
        {editing && (
          <form
            className="mt-4"
            onSubmit={(event) => {
              event.preventDefault();
              const next = draft.trim();
              if (!next || next === memory.claim) return;
              correct(memory.id, next);
              setEditingId(null);
              setNote("Saved. Future answers use this wording.");
              setUndoId(null);
            }}
          >
            <label className="sr-only" htmlFor={`correct-${memory.id}`}>Corrected wording</label>
            <textarea
              id={`correct-${memory.id}`}
              value={draft}
              maxLength={500}
              rows={3}
              className="w-full resize-none rounded-xl border bg-transparent px-3 py-2 text-sm"
              style={{ borderColor: "var(--line)" }}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="submit" className="btn btn-solid mt-2" disabled={!draft.trim() || draft.trim() === memory.claim}>
              Save correction
            </button>
          </form>
        )}
        {open && (
          <div className="mt-4 space-y-4">
            <div>
              <h4 className="text-sm font-semibold">Why this is stored</h4>
              {evidence.unavailable && (
                <p className="mt-2 text-sm leading-6">Exact evidence is unavailable.</p>
              )}
              {evidence.quotes.length > 0 && (
                <ul className="mt-2 space-y-2">
                  {evidence.quotes.map((quote) => (
                    <li key={quote} className="quote">“{quote}”</li>
                  ))}
                </ul>
              )}
              {!evidence.unavailable && evidence.quotes.length === 0 && (
                <p className="mt-2 text-sm leading-6" style={{ color: "var(--ink-dim)" }}>
                  The stored quote is not in the current message, so it is not shown.
                </p>
              )}
              {evidence.sources.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {evidence.sources.map((message) => (
                    <li key={message.id} className="rounded-xl px-3 py-2 text-sm leading-6" style={{ background: "var(--paper-2)" }}>
                      <span className="block text-xs" style={{ color: "var(--ink-dim)" }}>{stamp(message.createdAt)}</span>
                      {message.content}
                    </li>
                  ))}
                </ul>
              )}
              {memory.kind === "inference" && !evidence.unavailable && (
                <p className="mt-2 text-sm leading-6" style={{ color: "var(--ink-dim)" }}>
                  This goes past what you said. The message is the trace, not proof the guess is right.
                </p>
              )}
            </div>
            <div>
              <h4 className="text-sm font-semibold">How this changed</h4>
              {chain.length < 2 ? (
                <p className="mt-2 text-sm" style={{ color: "var(--ink-dim)" }}>No earlier version.</p>
              ) : (
                <ol className="mt-2 space-y-2">
                  {chain.map((version) => {
                    const current = version.id === chain[chain.length - 1]?.id;
                    return (
                      <li key={version.id} className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }}>
                        <span className="block text-xs" style={{ color: "var(--ink-dim)" }}>
                          {stamp(version.createdAt)} · {statusLabel(version.status)}
                        </span>
                        <span className="mt-1 block leading-6">{version.claim}</span>
                        {!current && canEdit && (
                          <button
                            type="button"
                            className="btn mt-2"
                            onClick={() => {
                              adoptClaim(version.id);
                              setNote("Saved. Future answers use this earlier wording.");
                            }}
                          >
                            Use this wording
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        )}
      </article>
    );
  }

  return (
    <div className="space-y-8">
      {(note || undoId) && (
        <p className="text-sm" role="status">
          {note}{" "}
          {undoId && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                restore(undoId);
                setUndoId(null);
                setNote("Restored.");
              }}
            >
              Undo
            </button>
          )}
        </p>
      )}
      <section aria-label="Needs review">
        <h2 className="serif text-2xl">Needs a look</h2>
        {review.length === 0 ? (
          <p className="mt-2 text-sm leading-6" style={{ color: "var(--ink-dim)" }}>
            No guesses are waiting. Confirmed beliefs are grouped below.
          </p>
        ) : (
          <div className="mt-3 space-y-3">{review.map(card)}</div>
        )}
      </section>
      {BUCKET_ORDER.map((bucket) => {
        const items = confirmed.filter((memory) => categoryOf(memory.claim) === bucket);
        if (!items.length) return null;
        return (
          <section key={bucket} aria-label={bucket}>
            <h2 className="serif text-2xl">{bucket}</h2>
            <div className="mt-3 space-y-3">{items.map(card)}</div>
          </section>
        );
      })}
      {forgotten.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer text-sm font-semibold">Forgotten ({forgotten.length})</summary>
          <ul className="mt-3 space-y-2">
            {forgotten.map((memory) => (
              <li key={memory.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{memory.claim}</span>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    restore(memory.id);
                    setUndoId(null);
                    setNote("Restored.");
                  }}
                >
                  Undo
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
