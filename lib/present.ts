import { promptFromMemories } from "./demo-personas";
import { versionChain } from "./memory-store";
import { evidenceQuoted, type ChatMessage, type Memory, type PromptMemory } from "./schemas";

export type Bucket = "Work" | "Education" | "Preferences" | "Routines" | "Experiences" | "Other";

const BUCKETS: { name: Exclude<Bucket, "Other">; test: RegExp }[] = [
  { name: "Education", test: /\b(lecture|math|class|course|study|school|problem set|confidence interval|student)\b/i },
  { name: "Routines", test: /\b(bike|monday|night before|weekly|weather|studio)\b/i },
  { name: "Preferences", test: /\b(vegetarian|seafood|salmon|eat|eats|hate|hates|order|food|diet|menu)\b/i },
  { name: "Experiences", test: /\b(moved|move|live|lives|lived|brooklyn|austin|boxes)\b/i },
  { name: "Work", test: /\b(work|works|job|manager|meeting|meetings|startup|engineer|northwind|harbor|calendar|office)\b/i },
];

export const BUCKET_ORDER: Bucket[] = ["Work", "Education", "Preferences", "Routines", "Experiences", "Other"];

export function kindLabel(kind: Memory["kind"]) {
  return kind === "inference" ? "AI guess" : "You told me";
}

export function statusLabel(status: Memory["status"]) {
  if (status === "candidate") return "Needs review";
  if (status === "approved") return "Confirmed";
  if (status === "superseded") return "Earlier version";
  return "Forgotten";
}

export type MemoryType = "Explicit" | "Inferred" | "Uncertain";

export function memoryType(memory: Pick<Memory, "kind" | "modelReportedConfidence">): MemoryType {
  if (memory.kind === "explicit") return "Explicit";
  return memory.modelReportedConfidence !== null && memory.modelReportedConfidence < 0.45 ? "Uncertain" : "Inferred";
}

export function needsReview(memory: Memory) {
  return memory.status === "candidate" || (memory.status === "approved" && memory.kind === "inference");
}

export function isConfirmed(memory: Memory) {
  return memory.status === "approved" && memory.kind === "explicit";
}

export function chainHeads(memories: Memory[]) {
  return memories.filter((memory) => memory.status === "approved" || memory.status === "candidate");
}

export function dateLabel(value: string) {
  if (!value || Number.isNaN(Date.parse(value))) return "Date unknown";
  return value.slice(0, 10);
}

export function categoryOf(claim: string): Bucket {
  return BUCKETS.find((bucket) => bucket.test.test(claim))?.name ?? "Other";
}

export function verifiedEvidence(memory: Memory, messages: ChatMessage[]) {
  const sources = messages.filter((message) => memory.sourceMessageIds.includes(message.id));
  const quotes = memory.evidence.filter((quote) => sources.some((message) => evidenceQuoted(quote, message.content)));
  return { sources, quotes, unavailable: sources.length === 0 && quotes.length === 0 };
}

export function memoryContrast(memories: Memory[], id: string) {
  const chain = versionChain(memories, id);
  const oldest = chain[0];
  const head = chain[chain.length - 1];
  if (!oldest || !head || oldest.id === head.id || oldest.claim === head.claim) return null;
  if (head.status !== "approved" && head.status !== "candidate") return null;
  const after = promptFromMemories(memories);
  const before: PromptMemory[] = after.map((item) =>
    item.id === head.id ? { ...item, claim: oldest.claim, kind: oldest.kind } : item,
  );
  return { before, after };
}

function selfCheck() {
  const base = {
    sourceMessageIds: ["m1"],
    evidence: ["moved from Austin"],
    version: 1,
    supersedesId: null,
    supersededById: null,
    priorStatus: null,
    modelReportedConfidence: null,
    createdAt: "2026-10-02T15:00:00.000Z",
  } satisfies Partial<Memory>;
  const guess: Memory = {
    ...base,
    id: "a",
    claim: "Maya lives in Austin.",
    kind: "inference",
    status: "approved",
  };
  const told: Memory = {
    ...base,
    id: "b",
    claim: "Maya bikes to the studio when the weather is decent.",
    kind: "explicit",
    status: "approved",
    evidence: ["I bike to the studio when the weather is decent."],
  };
  const next: Memory = {
    ...guess,
    id: "c",
    claim: "Maya lives in Brooklyn.",
    kind: "explicit",
    version: 2,
    supersedesId: "a",
    evidence: ["moved from Austin"],
  };
  const prior: Memory = { ...guess, status: "superseded", supersededById: "c" };
  if (categoryOf(guess.claim) !== "Experiences") throw new Error("category");
  if (categoryOf(told.claim) !== "Routines") throw new Error("routine");
  if (!needsReview(guess) || isConfirmed(guess)) throw new Error("review");
  if (!isConfirmed(told)) throw new Error("confirmed");
  if (memoryType(told) !== "Explicit" || memoryType(guess) !== "Inferred" || memoryType({ kind: "inference", modelReportedConfidence: 0.3 }) !== "Uncertain") throw new Error("type");
  if (kindLabel("inference") !== "AI guess" || statusLabel("candidate") !== "Needs review") throw new Error("label");
  const messages: ChatMessage[] = [
    { id: "m1", role: "user", content: "I just moved from Austin to Brooklyn.", createdAt: base.createdAt },
  ];
  const shown = verifiedEvidence(guess, messages);
  if (shown.quotes.length !== 1 || shown.unavailable) throw new Error("evidence");
  if (verifiedEvidence({ ...guess, sourceMessageIds: [], evidence: [] }, messages).unavailable !== true) {
    throw new Error("missing evidence");
  }
  const contrast = memoryContrast([prior, next], "c");
  if (!contrast || contrast.before[0]?.claim !== "Maya lives in Austin." || contrast.after[0]?.claim !== "Maya lives in Brooklyn.") {
    throw new Error("contrast");
  }
  if (memoryContrast([told], "b") !== null) throw new Error("no contrast");
  if (chainHeads([prior, next, told]).length !== 2) throw new Error("heads");
}

selfCheck();
