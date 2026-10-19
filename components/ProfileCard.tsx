"use client";

import { useEffect, useState } from "react";
import { Briefcase, Calendar, Heart, MessageCircle, User } from "lucide-react";
import { getPersona } from "@/lib/demo-personas";
import { buildProfile, type ProfileStatement } from "@/lib/profile";
import { eventsFor } from "@/lib/lineage";
import { categoryOf, kindLabel, needsReview, verifiedEvidence } from "@/lib/present";
import { useMemoryStore, versionChain } from "@/lib/memory-store";

const TILES = [
  { name: "Work", hint: "Current and past roles", icon: Briefcase },
  { name: "Interests", hint: "What you like", icon: Heart },
  { name: "Communication", hint: "How to talk to you", icon: MessageCircle },
  { name: "Routines", hint: "Habits and preferences", icon: Calendar },
] as const;

function tileOf(statement: ProfileStatement) {
  const bucket = categoryOf(statement.text);
  if (statement.category === "Needs a look") return null;
  if (/\b(interested|vision|dataset|paper|autonomous)\b/i.test(statement.text)) return "Interests";
  if (/\b(meeting|1:1|shorter|explain|notes|agenda|concise|preamble|bullets|status|standup|readout)\b/i.test(statement.text)) return "Communication";
  if (/\b(harbor|northwind|works at|startup)\b/i.test(statement.text)) return "Work";
  if (statement.category === "Interests" || statement.category === "Dislikes" || bucket === "Preferences") return "Interests";
  if (/\b(monday|night before|deep work|before noon|dinner|bike)\b/i.test(statement.text) || statement.category === "Habits" && bucket === "Routines") return "Routines";
  if (bucket === "Work" || bucket === "Education" || statement.category === "Background" || statement.category === "Goals") return "Work";
  if (statement.category === "Habits" && /\b(monday|night|noon|focus|block)\b/i.test(statement.text)) return "Routines";
  return null;
}

const FACETS = ["all", "confirmed", "assumption", ...TILES.map((tile) => tile.name)] as const;
type Facet = (typeof FACETS)[number];

function facetLabel(facet: Facet) {
  if (facet === "all") return "All";
  if (facet === "confirmed") return "Confirmed";
  if (facet === "assumption") return "Assumptions";
  return facet;
}

export default function ProfileCard() {
  const personaId = useMemoryStore((state) => state.personaId);
  const [query, setQuery] = useState("");
  const [facet, setFacet] = useState<Facet>("all");
  const [panel, setPanel] = useState<{ id: string; kind: "why" | "correct" | "history" } | null>(null);
  const [draft, setDraft] = useState("");
  const memories = useMemoryStore((state) => state.memories);
  const messages = useMemoryStore((state) => state.messages);
  const selectMemory = useMemoryStore((state) => state.selectMemory);
  const setDestination = useMemoryStore((state) => state.setDestination);
  const deleteMemory = useMemoryStore((state) => state.deleteMemory);
  const correct = useMemoryStore((state) => state.correct);
  const rememberProfile = useMemoryStore((state) => state.rememberProfile);
  const name = getPersona(personaId).name;
  const profile = buildProfile(personaId, memories);
  const confirmed = profile.statements.filter((statement) => statement.kind === "explicit" && statement.status === "approved");
  const assumptions = profile.statements.filter((statement) => statement.kind === "inference" || statement.status === "candidate");
  const summary = [
    confirmed.slice(0, 2).map((statement) => statement.text).join(" "),
    assumptions.length ? `The record assumes ${assumptions.slice(0, 2).map((statement) => statement.text).join(" ")}` : "",
  ].filter(Boolean).join(" ");
  const tiles = TILES.map((tile) => ({
    ...tile,
    statements: profile.statements.filter((statement) => tileOf(statement) === tile.name),
  }));

  const needle = query.trim().toLowerCase();
  const listed = profile.statements.filter((statement) => {
    if (needle && !statement.text.toLowerCase().includes(needle)) return false;
    if (facet === "confirmed") return statement.kind === "explicit" && statement.status === "approved";
    if (facet === "assumption") return statement.kind === "inference" || statement.status === "candidate";
    if (facet !== "all") return tileOf(statement) === facet;
    return true;
  });

  useEffect(() => {
    setQuery("");
    setFacet("all");
    setPanel(null);
  }, [personaId]);

  useEffect(() => {
    rememberProfile({ at: new Date().toISOString(), statements: profile.statements });
  }, [personaId, memories, rememberProfile, profile.statements]);

  function open(statement: ProfileStatement) {
    selectMemory(statement.memoryIds[0] ?? null);
    setDestination("explorer");
  }

  function toggle(id: string, kind: "why" | "correct" | "history", claim = "") {
    if (panel?.id === id && panel.kind === kind) setPanel(null);
    else {
      setPanel({ id, kind });
      if (kind === "correct") setDraft(claim);
    }
  }

  return (
    <section id="profile" className="card" aria-label="How your AI sees you">
      <div className="flex gap-3">
        <div className="grid size-12 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--info) 18%, var(--panel))" }} aria-hidden>
          <User className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="kicker">How your AI sees you</p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="serif text-3xl leading-tight">{name}</h2>
              <p className="text-sm" style={{ color: "var(--ink-dim)" }}>Your AI’s understanding of you</p>
            </div>
            <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
              {profile.updatedAt ? `Last updated ${profile.updatedAt.slice(0, 10)}` : "Nothing recorded yet"}
            </p>
          </div>
        </div>
      </div>
      <p className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full px-2 py-1" style={{ background: "color-mix(in srgb, var(--good) 18%, var(--panel))" }}>{confirmed.length} confirmed</span>
        <span className="rounded-full px-2 py-1" style={{ background: "color-mix(in srgb, var(--warn) 22%, var(--panel))" }}>{assumptions.length} {assumptions.length === 1 ? "assumption" : "assumptions"}</span>
      </p>
      <p className="mt-3 text-sm leading-6">{summary || "Nothing is stored yet."}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          const first = tile.statements[0];
          return (
            <button
              key={tile.name}
              type="button"
              className="rounded-md border px-3 py-3 text-left"
              style={{ borderColor: "var(--line)" }}
              disabled={!first}
              aria-pressed={facet === tile.name}
              onClick={() => first && setFacet(facet === tile.name ? "all" : tile.name)}
            >
              <Icon aria-hidden className="mb-2 size-4" />
              <span className="block text-sm font-semibold">{tile.name}</span>
              <span className="mt-1 block text-xs leading-5" style={{ color: "var(--ink-dim)" }}>{first ? first.text : "Nothing stored yet"}</span>
            </button>
          );
        })}
      </div>
      <label className="sr-only" htmlFor="belief-search">Search beliefs</label>
      <input
        id="belief-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search beliefs"
        className="mt-4 w-full rounded-md border bg-transparent px-3 py-1.5 text-sm"
        style={{ borderColor: "var(--line)" }}
      />
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Filter beliefs">
        {FACETS.map((item) => (
          <button
            key={item}
            type="button"
            className="btn"
            aria-pressed={facet === item}
            onClick={() => setFacet(item)}
          >
            {facetLabel(item)}
          </button>
        ))}
      </div>
      <ul className="mt-3 max-h-96 space-y-3 overflow-auto">
        {listed.length === 0 && <li className="text-sm" style={{ color: "var(--ink-dim)" }}>Nothing matches.</li>}
        {listed.map((statement) => {
          const memory = memories.find((item) => item.id === statement.memoryIds[0]);
          const evidence = memory ? verifiedEvidence(memory, messages) : null;
          const review = memory ? needsReview(memory) : statement.kind === "inference";
          return (
            <li key={statement.id} className="rounded-md border px-3 py-2" style={{ borderColor: "var(--line)" }}>
              <button type="button" className="text-left text-sm leading-6" onClick={() => open(statement)}>{statement.text}</button>
              <p className="mt-1 text-xs" style={{ color: "var(--ink-dim)" }}>
                {kindLabel(statement.kind)}
                {review ? " · Assumption" : " · Confirmed"}
                {evidence?.unavailable ? " · Origin unavailable" : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn"
                  aria-expanded={panel?.id === statement.id && panel.kind === "why"}
                  onClick={() => toggle(statement.id, "why")}
                >
                  Why?
                </button>
                <button
                  type="button"
                  className="btn"
                  aria-expanded={panel?.id === statement.id && panel.kind === "correct"}
                  disabled={!memory}
                  onClick={() => memory && toggle(statement.id, "correct", memory.claim)}
                >
                  Correct
                </button>
                <button type="button" className="btn" onClick={() => memory && deleteMemory(memory.id)}>Forget</button>
                <button
                  type="button"
                  className="btn"
                  aria-expanded={panel?.id === statement.id && panel.kind === "history"}
                  disabled={!memory}
                  onClick={() => memory && toggle(statement.id, "history")}
                >
                  History
                </button>
              </div>
              {panel?.id === statement.id && panel.kind === "correct" && memory && (
                <form
                  className="mt-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    correct(memory.id, draft);
                    setPanel(null);
                  }}
                >
                  <label className="sr-only" htmlFor={`correct-${statement.id}`}>Corrected wording</label>
                  <textarea
                    id={`correct-${statement.id}`}
                    value={draft}
                    maxLength={500}
                    rows={2}
                    className="w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm"
                    style={{ borderColor: "var(--line)" }}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                  <button type="submit" className="btn mt-2" disabled={!draft.trim() || draft.trim() === memory.claim}>Save correction</button>
                </form>
              )}
              {panel?.id === statement.id && panel.kind === "history" && memory && (
                <ol className="mt-2 space-y-1 text-sm leading-6">
                  {versionChain(memories, memory.id).map((item) => (
                    <li key={item.id}>
                      {item.createdAt.slice(0, 10)} · {eventsFor(item, memories).map((event) => event.text).join(" ")} {item.claim}
                    </li>
                  ))}
                </ol>
              )}
              {panel?.id === statement.id && panel.kind === "why" && (
                <div className="mt-2 text-sm leading-6">
                  {memory?.kind === "inference"
                    ? "This is an assumption drawn from these messages."
                    : "This was stored from what you said."}
                  {evidence && evidence.quotes.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {evidence.quotes.map((quote) => (
                        <li key={quote} className="quote">“{quote}”</li>
                      ))}
                    </ul>
                  )}
                  {evidence?.unavailable && <p className="mt-1">Source unavailable.</p>}
                  {evidence && !evidence.unavailable && evidence.quotes.length === 0 && (
                    <p className="mt-1" style={{ color: "var(--ink-dim)" }}>The stored quote is not in the current message.</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
