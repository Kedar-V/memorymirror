import { promptFromMemories } from "./demo-personas";
import {
  EXTRACTION_VERSION,
  evidenceQuoted,
  memorySchema,
  normText,
  relationshipSchema,
  type ChatMessage,
  type ExtractedRelation,
  type Memory,
  type Relationship,
} from "./schemas";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function jobMentions(text: string) {
  const found: { name: string; past: boolean; ended: boolean }[] = [];
  const re = /\b(left|worked at|works at|working at|work at)\s+([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,2})/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    found.push({
      name: match[2].replace(/\s+in$/, "").trim(),
      past: match[1].toLowerCase() === "left" || match[1].toLowerCase() === "worked at",
      ended: match[1].toLowerCase() === "left",
    });
  }
  return found;
}

function monthEnd(text: string, recordedAt: string) {
  const month = MONTHS.findIndex((name) => text.toLowerCase().includes(name));
  const year = recordedAt.slice(0, 4);
  if (month < 0 || !/^\d{4}$/.test(year)) return undefined;
  return new Date(Date.UTC(Number(year), month + 1, 0)).toISOString();
}

function facetOf(text: string): Memory["facet"] {
  if (/\b(studied|college|university|course)\b/i.test(text)) return "education";
  if (/\b(work|worked|job|left)\b/i.test(text)) return "employment";
  if (/\b(prefer|meeting)\b/i.test(text)) return "preferences";
  if (/\b(live|lived|lives)\b/i.test(text)) return "background";
  if (/\b(goal|priority)\b/i.test(text)) return "goals";
  return undefined;
}

function mergeSame(memories: Memory[]) {
  const out: Memory[] = [];
  for (const memory of memories) {
    const prior = out.find((item) => item.status !== "superseded" && item.status !== "deleted" && normText(item.claim) === normText(memory.claim) && item.kind === memory.kind);
    if (!prior) {
      out.push({ ...memory, facet: memory.facet ?? facetOf(`${memory.claim} ${memory.evidence.join(" ")}`) });
      continue;
    }
    prior.sourceMessageIds = [...new Set([...prior.sourceMessageIds, ...memory.sourceMessageIds])].slice(0, 8);
    prior.evidence = [...new Set([...prior.evidence, ...memory.evidence])].slice(0, 8);
  }
  return out;
}

function timeJobs(memories: Memory[], messages: ChatMessage[]) {
  const mentions = memories.flatMap((memory) => {
    const source = messages.find((message) => message.id === memory.sourceMessageIds[0]);
    return jobMentions(`${memory.claim}. ${memory.evidence.join(". ")}`).map((job) => ({
      ...job,
      evidence: memory.evidence[0] ?? memory.claim,
      sourceId: memory.sourceMessageIds[0],
      at: source?.createdAt ?? "",
    }));
  });
  for (const memory of memories) {
    const jobs = jobMentions(memory.claim);
    if (jobs.length !== 1) continue;
    const ended = mentions.find((item) => item.name.toLowerCase() === jobs[0].name.toLowerCase() && item.ended);
    if (!ended) continue;
    const validTo = monthEnd(ended.evidence, ended.at);
    if (validTo) memory.validTo = validTo;
    const started = messages.find((message) => message.id === memory.sourceMessageIds[0] && message.createdAt);
    if (started?.createdAt && jobs[0].past) memory.validFrom = started.createdAt;
  }
  return memories;
}

function linkJobs(memories: Memory[], messages: ChatMessage[], userId: string, at: string) {
  const current = memories.filter((memory) => memory.status === "candidate" || memory.status === "approved");
  const rows = current.flatMap((memory) => jobMentions(memory.claim).filter((job) => jobMentions(memory.claim).length === 1).map((job) => ({ job, memory })));
  const past = rows.find((row) => row.job.past);
  const now = rows.find((row) => !row.job.past && row.job.name.toLowerCase() !== past?.job.name.toLowerCase());
  const links: Relationship[] = [];
  if (!past || !now) return links;
  const evidence = messages.find((message) => /\bleft\b/i.test(message.content) && message.content.includes(past.job.name));
  if (!evidence || !evidenceQuoted(evidence.content.slice(0, 500), evidence.content)) return links;
  const parsed = relationshipSchema.safeParse({
    id: `job-${crypto.randomUUID()}`.slice(0, 80),
    userId,
    sourceId: now.memory.id,
    targetId: past.memory.id,
    type: "RELATED_TO",
    evidenceIds: [evidence.id],
    kind: "explicit",
    createdAt: at,
    status: "active",
    explanation: `left ${past.job.name} and works at ${now.job.name}`,
  });
  if (parsed.success) links.push(parsed.data);
  return links;
}

function assumption(memories: Memory[], at: string) {
  const parent = memories.find((memory) => /prefer short, focused meetings|prefer short meetings|prefer shorter meetings/i.test(`${memory.claim} ${memory.evidence.join(" ")}`));
  if (!parent || memories.some((memory) => /dislikes meetings/i.test(memory.claim))) return memories;
  const quote = parent.evidence.find((item) => evidenceQuoted(item, item) || item.length >= 12) ?? parent.evidence[0];
  if (!quote) return memories;
  const parsed = memorySchema.safeParse({
    id: `inf-${crypto.randomUUID()}`.slice(0, 80),
    claim: "The user dislikes meetings.",
    kind: "inference",
    status: "candidate",
    sourceMessageIds: parent.sourceMessageIds.slice(0, 8),
    evidence: [quote.slice(0, 500)],
    version: 1,
    supersedesId: null,
    supersededById: null,
    priorStatus: null,
    modelReportedConfidence: null,
    createdAt: at,
    facet: "preferences",
    derivedFromIds: [parent.id],
    extractionModel: parent.extractionModel,
    extractedAt: at,
    extractionVersion: EXTRACTION_VERSION,
  });
  return parsed.success ? [...memories, parsed.data] : memories;
}

export function bindRelations(relations: ExtractedRelation[], memories: Memory[], messages: ChatMessage[], userId: string, at: string) {
  const links: Relationship[] = [];
  for (const relation of relations) {
    const source = messages.find((message) => message.id === relation.sourceMessageId && message.role === "user");
    if (!source || !evidenceQuoted(relation.evidenceQuote, source.content)) continue;
    const from = memories.find((memory) => normText(memory.claim) === normText(relation.sourceClaim));
    const to = memories.find((memory) => normText(memory.claim) === normText(relation.targetClaim));
    if (!from || !to || from.id === to.id) continue;
    const parsed = relationshipSchema.safeParse({
      id: `rel-${crypto.randomUUID()}`.slice(0, 80),
      userId,
      sourceId: from.id,
      targetId: to.id,
      type: relation.type,
      evidenceIds: [source.id],
      kind: relation.kind,
      createdAt: at,
      status: "active",
      explanation: relation.explanation,
    });
    if (parsed.success) links.push(parsed.data);
  }
  return links;
}

export function intactRelations(relationships: Relationship[], memories: Memory[]) {
  const ids = new Set(memories.map((memory) => memory.id));
  return relationships.filter((item) => ids.has(item.sourceId) && ids.has(item.targetId));
}

export function reconcile(memories: Memory[], messages: ChatMessage[], relations: ExtractedRelation[], userId: string) {
  const at = new Date().toISOString();
  const merged = timeJobs(mergeSame(memories), messages);
  const withAssumption = assumption(merged, at);
  const relationships = intactRelations(
    [...linkJobs(withAssumption, messages, userId, at), ...bindRelations(relations, withAssumption, messages, userId, at)],
    withAssumption,
  );
  return { memories: withAssumption, relationships };
}

export function supersede(memories: Memory[], id: string, claim: string, at: string) {
  const old = memories.find((memory) => memory.id === id);
  if (!old || (old.status !== "approved" && old.status !== "candidate") || old.claim === claim) return memories;
  const nextId = `rev-${crypto.randomUUID()}`.slice(0, 80);
  const next: Memory = {
    ...old,
    id: nextId,
    claim,
    kind: "explicit",
    status: "approved",
    version: old.version + 1,
    supersedesId: old.id,
    supersededById: null,
    priorStatus: null,
    modelReportedConfidence: null,
    createdAt: at,
  };
  return memories
    .map((memory) => (memory.id === id ? { ...memory, status: "superseded" as const, supersededById: nextId } : memory))
    .concat(next);
}

export function forget(memories: Memory[], id: string) {
  return memories.map((memory) =>
    memory.id === id && memory.status !== "deleted" ? { ...memory, priorStatus: memory.status, status: "deleted" as const } : memory,
  );
}

export function activeClaims(memories: Memory[]) {
  return promptFromMemories(memories).map((memory) => memory.claim);
}
