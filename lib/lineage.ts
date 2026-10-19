import { personas } from "./demo-personas";
import { categoryOf } from "./present";
import { buildProfile, profileIsClean } from "./profile";
import {
  evidenceQuoted,
  type ChatMessage,
  type EdgeType,
  type Memory,
  type PromptMemory,
  type Relationship,
} from "./schemas";

export const EDGE_MEANING: Record<EdgeType, string> = {
  EXTRACTED_FROM: "This belief was taken from that message.",
  INFERRED_FROM: "This assumption was drawn from that message.",
  SUPPORTS: "The source belief supports the target.",
  CONTRADICTS: "These two current beliefs disagree.",
  RELATED_TO: "A recorded link that is not a more specific type.",
  SUPERSEDES: "The newer belief replaces the older one.",
  AMENDS: "A person corrected the older belief.",
  USED_IN: "This belief was sent with that reply.",
  SUMMARIZED_IN: "This belief is included in that profile line.",
};

export type GraphNode = {
  id: string;
  type: "person" | "cluster" | "evidence" | "explicit" | "inference" | "version" | "response" | "conversation" | "profile";
  label: string;
  caption: string;
  memoryId?: string;
  category?: string;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  provenance: boolean;
  label: string;
};

const PROVENANCE = new Set<EdgeType>(["EXTRACTED_FROM", "INFERRED_FROM", "SUPERSEDES", "AMENDS", "USED_IN"]);

export function chainOf(memories: Memory[], id: string) {
  const byId = new Map(memories.map((memory) => [memory.id, memory]));
  let current = byId.get(id);
  if (!current) return [];
  const seen = new Set<string>();
  while (current.supersedesId && byId.has(current.supersedesId) && !seen.has(current.id)) {
    seen.add(current.id);
    current = byId.get(current.supersedesId)!;
  }
  const chain: Memory[] = [];
  while (current && !seen.has(`out:${current.id}`)) {
    seen.add(`out:${current.id}`);
    chain.push(current);
    if (!current.supersededById || !byId.has(current.supersededById)) break;
    current = byId.get(current.supersededById);
  }
  return chain;
}

function active(memory: Memory) {
  return memory.status === "approved" || memory.status === "candidate";
}

export function conflicts(memories: Memory[]) {
  const heads = memories.filter(active);
  const pairs: [Memory, Memory][] = [];
  const rules: [RegExp, RegExp][] = [
    [/\baustin\b/i, /\bbrooklyn\b/i],
    [/\bvegetarian\b/i, /\bseafood\b|\bsalmon\b/i],
    [/\bnorthwind\b/i, /\bharbor grid\b/i],
    [/\bhate meetings\b|\bhates meetings\b/i, /\b1:1\b/i],
  ];
  for (let i = 0; i < heads.length; i += 1) {
    for (let j = i + 1; j < heads.length; j += 1) {
      const left = heads[i];
      const right = heads[j];
      const opposed = rules.some(
        ([a, b]) => (a.test(left.claim) && b.test(right.claim)) || (b.test(left.claim) && a.test(right.claim)),
      );
      if (!opposed || !periodsOverlap(left, right)) continue;
      pairs.push([left, right]);
    }
  }
  return pairs;
}

function periodsOverlap(left: Memory, right: Memory) {
  const start = (memory: Memory) => Date.parse(memory.validFrom || memory.createdAt);
  const end = (memory: Memory) => (memory.validTo ? Date.parse(memory.validTo) : Number.POSITIVE_INFINITY);
  return start(left) <= end(right) && start(right) <= end(left);
}

export function provenanceEdges(memories: Memory[], messages: ChatMessage[]): GraphEdge[] {
  const messageIds = new Set(messages.map((message) => message.id));
  const memoryIds = new Set(memories.map((memory) => memory.id));
  const edges: GraphEdge[] = [];
  for (const memory of memories) {
    const type: EdgeType = memory.kind === "inference" ? "INFERRED_FROM" : "EXTRACTED_FROM";
    for (const sourceId of memory.sourceMessageIds) {
      if (!messageIds.has(sourceId)) continue;
      edges.push({
        id: `${type}:${memory.id}:${sourceId}`,
        source: memory.id,
        target: `msg:${sourceId}`,
        type,
        provenance: true,
        label: memory.kind === "inference" ? "assumed from" : "from chat",
      });
    }
    if (memory.supersedesId && memoryIds.has(memory.supersedesId)) {
      const amended = memory.kind === "explicit" && memory.version > 1;
      const type: EdgeType = amended ? "AMENDS" : "SUPERSEDES";
      edges.push({
        id: `${type}:${memory.id}:${memory.supersedesId}`,
        source: memory.id,
        target: memory.supersedesId,
        type,
        provenance: true,
        label: amended ? "corrects" : "replaces",
      });
    }
  }
  for (const message of messages) {
    for (const memoryId of message.usedMemoryIds ?? []) {
      if (!memoryIds.has(memoryId)) continue;
      edges.push({
        id: `USED_IN:${memoryId}:${message.id}`,
        source: memoryId,
        target: `msg:${message.id}`,
        type: "USED_IN",
        provenance: true,
        label: "used in",
      });
    }
  }
  return edges.filter((edge) => PROVENANCE.has(edge.type));
}

export function relationshipEdges(relationships: Relationship[]): GraphEdge[] {
  return relationships
    .filter((item) => item.status === "active" && (item.type !== "RELATED_TO" || item.explanation))
    .map((item) => ({
      id: item.id,
      source: item.sourceId,
      target: item.targetId,
      type: item.type,
      provenance: PROVENANCE.has(item.type),
      label: item.explanation || (item.type === "CONTRADICTS" ? "disagrees" : item.type === "SUPPORTS" ? "supports" : item.type.toLowerCase()),
    }));
}

export function visibleAt(memories: Memory[], time: number) {
  return memories.filter((memory) => {
    const learned = Date.parse(memory.createdAt);
    if (Number.isNaN(learned)) return true;
    return learned <= time;
  });
}

export function counterfactualLists(
  memories: Memory[],
  selectedId: string,
  edited: string,
  dropDependents: boolean,
) {
  const heads = memories.filter(active);
  const chain = chainOf(memories, selectedId);
  const oldest = chain[0];
  const head = chain[chain.length - 1];
  const chainIds = new Set(chain.map((memory) => memory.id));
  const dependentIds = new Set<string>();
  if (dropDependents && head) {
    for (const memory of heads) {
      if (memory.id === head.id || memory.kind !== "inference") continue;
      if (memory.sourceMessageIds.some((id) => head.sourceMessageIds.includes(id))) dependentIds.add(memory.id);
    }
  }
  const toPrompt = (list: Memory[]): PromptMemory[] =>
    list.map((memory) => ({
      id: memory.id,
      claim: memory.claim,
      kind: memory.kind,
      status: memory.status as "approved" | "candidate",
    }));
  const keep = (memory: Memory) => !dependentIds.has(memory.id);
  const original = heads.filter(keep).map((memory) =>
    memory.id === head?.id && oldest ? { ...memory, claim: oldest.claim, kind: oldest.kind } : memory,
  );
  const corrected = heads.filter(keep).map((memory) =>
    memory.id === head?.id ? { ...memory, claim: edited, kind: "explicit" as const } : memory,
  );
  const without = heads.filter((memory) => !chainIds.has(memory.id) && !dependentIds.has(memory.id));
  return { original: toPrompt(original), corrected: toPrompt(corrected), without: toPrompt(without) };
}

export function labMessages(question: string) {
  return [{ id: "lab-q", role: "user" as const, content: question }];
}

export function phraseTakeaway(phrases: string[], replies: { name: string; text: string }[]) {
  const diffs = phrases.filter((phrase) => {
    const hits = replies.map((reply) => reply.text.toLowerCase().includes(phrase.toLowerCase()));
    return hits.some(Boolean) && !hits.every(Boolean);
  });
  if (!diffs.length) return "The replies do not differ on the watched phrases.";
  return `These watched phrases are not in every reply: ${diffs.join(", ")}. That is a difference in this prompt, not a cause beyond it.`;
}

export function eventsFor(memory: Memory, memories: Memory[]) {
  const events: { type: string; at: string; text: string }[] = [
    { type: "CREATED", at: memory.createdAt, text: "The AI recorded this belief." },
  ];
  if (memory.supersedesId) {
    events.push({ type: "AMENDED", at: memory.createdAt, text: "A newer version was stored beside the older one." });
  }
  if (memory.kind === "explicit" && memory.supersedesId) {
    events.push({ type: "CORRECTED", at: memory.createdAt, text: "A person corrected an earlier belief." });
  } else if (memory.status === "approved" && memory.kind === "explicit") {
    events.push({ type: "CONFIRMED", at: memory.createdAt, text: "This was saved as something the person said." });
  }
  const next = memories.find((item) => item.supersedesId === memory.id);
  if (next) events.push({ type: "SUPERSEDED", at: next.createdAt, text: "A later version replaced this one." });
  if (memory.status === "deleted") {
    events.push({ type: "FORGOTTEN", at: memory.createdAt, text: "This belief was removed from use. The exact time of removal was not stored." });
  }
  if (conflicts(memories).some(([left, right]) => left.id === memory.id || right.id === memory.id)) {
    events.push({ type: "CONTRADICTED", at: memory.createdAt, text: "Another current belief disagrees with this one." });
  }
  return events;
}

function inferenceOverview(input: {
  name: string;
  memories: Memory[];
  messages: ChatMessage[];
  selectedId: string | null;
  query: string;
  kind: "all" | "explicit" | "inference";
  life: "active" | "historical";
}): { nodes: GraphNode[]; edges: GraphEdge[]; open: string[] } | null {
  if (input.query.trim() || input.kind === "explicit" || input.life === "historical") return null;
  const live = input.memories.filter((memory) => memory.kind === "inference" && active(memory) && (memory.derivedFromIds?.length ?? 0) > 1);
  if (live.length < 10) return null;
  const nodes: GraphNode[] = [{ id: "person", type: "person", label: input.name, caption: "Person" }];
  for (const memory of live) {
    nodes.push({
      id: memory.id,
      type: "inference",
      label: memory.claim,
      caption: "Inferred memory",
      memoryId: memory.id,
    });
  }
  const picked = input.memories.find((memory) => memory.id === input.selectedId);
  const selected = picked?.derivedFromIds?.length
    ? picked
    : live.find((memory) => memory.derivedFromIds?.includes(input.selectedId ?? ""));
  const edges: GraphEdge[] = [];
  if (!selected?.derivedFromIds?.length) return { nodes, edges, open: [] };
  for (const explicitId of selected.derivedFromIds) {
    const explicit = input.memories.find((memory) => memory.id === explicitId);
    if (!explicit) continue;
    nodes.push({
      id: explicit.id,
      type: "explicit",
      label: explicit.claim,
      caption: "Explicit memory",
      memoryId: explicit.id,
    });
    edges.push({
      id: `derived:${selected.id}:${explicit.id}`,
      source: selected.id,
      target: explicit.id,
      type: "INFERRED_FROM",
      provenance: true,
      label: "derived from",
    });
    for (const messageId of explicit.sourceMessageIds) {
      const message = input.messages.find((item) => item.id === messageId);
      if (!message || !message.content.includes(explicit.evidence[0] ?? "")) continue;
      const nodeId = `msg:${messageId}`;
      if (!nodes.some((node) => node.id === nodeId)) {
        nodes.push({
          id: nodeId,
          type: "evidence",
          label: message.content.slice(0, 160),
          caption: "Conversation message",
        });
      }
      edges.push({
        id: `from:${explicit.id}:${messageId}`,
        source: explicit.id,
        target: nodeId,
        type: "EXTRACTED_FROM",
        provenance: true,
        label: "from chat",
      });
    }
  }
  return { nodes, edges, open: [] };
}

export function buildGraph(input: {
  name: string;
  userId: string;
  memories: Memory[];
  messages: ChatMessage[];
  relationships: Relationship[];
  expanded: string[];
  showEvidence: boolean;
  showRelations: boolean;
  query: string;
  kind: "all" | "explicit" | "inference";
  life: "active" | "historical";
  selectedId: string | null;
}) {
  const query = input.query.trim().toLowerCase();
  const exploded = inferenceOverview(input);
  if (exploded) return exploded;
  const pool = input.memories.filter((memory) => {
    if (input.life === "active" && !active(memory)) return false;
    if (input.life === "historical" && memory.status !== "superseded" && memory.status !== "deleted") return false;
    if (input.kind !== "all" && memory.kind !== input.kind) return false;
    if (query && !memory.claim.toLowerCase().includes(query)) return false;
    return true;
  });
  const nodes: GraphNode[] = [
    { id: "person", type: "person", label: input.name, caption: "Person" },
  ];
  const edges: GraphEdge[] = [];
  const profile = buildProfile(input.userId, input.memories);
  const conversationIds = [...new Set(input.messages.map((message) => message.conversationId).filter((id): id is string => Boolean(id)))];
  const history: Memory[] = [];
  const categories = [...new Set(pool.map((memory) => categoryOf(memory.claim)))];
  const open = new Set(input.expanded);
  if (query) categories.forEach((category) => open.add(category));
  for (const category of categories) {
    const members = pool.filter((memory) => categoryOf(memory.claim) === category);
    if (!open.has(category)) {
      nodes.push({
        id: `cluster:${category}`,
        type: "cluster",
        label: category,
        caption: `${members.length} beliefs`,
        category,
      });
      continue;
    }
    const ancestors: Memory[] = [];
    for (const memory of members) {
      let current: Memory | undefined = memory;
      const seen = new Set<string>();
      while (current?.supersedesId && !seen.has(current.id)) {
        seen.add(current.id);
        const previous = input.memories.find((item) => item.id === current?.supersedesId);
        if (!previous) break;
        if (!members.some((item) => item.id === previous.id) && !ancestors.some((item) => item.id === previous.id)) {
          ancestors.push(previous);
          history.push(previous);
        }
        current = previous;
      }
    }
    for (const memory of [...members, ...ancestors]) {
      if (nodes.some((node) => node.id === memory.id)) continue;
      nodes.push({
        id: memory.id,
        type: memory.status === "superseded" ? "version" : memory.kind === "inference" ? "inference" : "explicit",
        label: memory.claim,
        caption: memory.status === "superseded"
          ? "Earlier version"
          : memory.kind === "inference"
            ? "Inferred memory"
            : "Explicit memory",
        memoryId: memory.id,
        category,
      });
    }
  }
  const shown = new Set(nodes.map((node) => node.id));
  const prov = provenanceEdges([...pool, ...history], input.messages);
  const rel = input.showRelations ? relationshipEdges(input.relationships) : [];
  for (const edge of [...prov, ...rel]) {
    if (!shown.has(edge.source)) continue;
    if (edge.target.startsWith("msg:")) {
      if (!input.showEvidence && edge.source !== input.selectedId) continue;
      const messageId = edge.target.slice(4);
      const message = input.messages.find((item) => item.id === messageId);
      if (!message) continue;
      if (!shown.has(edge.target)) {
        nodes.push({
          id: edge.target,
          type: message.role === "assistant" ? "response" : "evidence",
          label: message.content.slice(0, 140),
          caption: message.role === "assistant" ? "AI response" : "Conversation message",
        });
        shown.add(edge.target);
      }
    } else if (!shown.has(edge.target)) continue;
    edges.push(edge);
  }
  if (conversationIds.length && !open.has("conversations")) {
    nodes.push({
      id: "cluster:conversations",
      type: "cluster",
      label: "Conversations",
      caption: `${conversationIds.length} conversations`,
      category: "conversations",
    });
  } else {
    for (const conversationId of conversationIds) {
      const title = input.messages.find((message) => message.conversationId === conversationId)?.title || "Conversation";
      nodes.push({ id: `conv:${conversationId}`, type: "conversation", label: title, caption: "Conversation" });
    }
  }
  if (profile.statements.length && !open.has("profile")) {
    nodes.push({
      id: "cluster:profile",
      type: "cluster",
      label: "How your AI sees you",
      caption: `${profile.statements.length} lines`,
      category: "profile",
    });
  } else {
    for (const statement of profile.statements) {
      nodes.push({ id: statement.id, type: "profile", label: statement.text, caption: statement.category });
      for (const memoryId of statement.memoryIds) {
        if (!shown.has(memoryId)) continue;
        edges.push({
          id: `SUMMARIZED_IN:${memoryId}:${statement.id}`,
          source: memoryId,
          target: statement.id,
          type: "SUMMARIZED_IN",
          provenance: true,
          label: "in profile",
        });
      }
    }
  }
  const conflictEdges: GraphEdge[] = input.showRelations
    ? conflicts(pool).flatMap(([left, right]) =>
        shown.has(left.id) && shown.has(right.id)
          ? [{
              id: `CONTRADICTS:${left.id}:${right.id}`,
              source: left.id,
              target: right.id,
              type: "CONTRADICTS" as const,
              provenance: false,
              label: "disagrees",
            }]
          : [],
      )
    : [];
  return { nodes, edges: [...edges, ...conflictEdges], open: [...open] };
}

export function lineageIds(edges: GraphEdge[], selectedId: string | null) {
  if (!selectedId) return new Set<string>();
  const ids = new Set<string>([selectedId]);
  for (let hop = 0; hop < 3; hop += 1) {
    for (const edge of edges) {
      if (ids.has(edge.source)) ids.add(edge.target);
      if (ids.has(edge.target)) ids.add(edge.source);
    }
  }
  return ids;
}

function assertLineage() {
  for (const persona of personas) {
    if (!persona.memories.length) {
      if (!profileIsClean(persona.id, persona.memories)) throw new Error(`profile ${persona.id}`);
      continue;
    }
    for (const memory of persona.memories) {
      const message = persona.messages.find((item) => item.id === memory.sourceMessageIds[0]);
      if (!message || !evidenceQuoted(memory.evidence[0], message.content)) {
        throw new Error(`quote ${memory.id}`);
      }
    }
    const edges = provenanceEdges(persona.memories, persona.messages);
    const messages = new Set(persona.messages.map((message) => message.id));
    for (const edge of edges) {
      if (edge.target.startsWith("msg:") && !messages.has(edge.target.slice(4))) throw new Error("orphan");
    }
    if (!profileIsClean(persona.id, persona.memories)) throw new Error(`profile ${persona.id}`);
    const forgotten = persona.memories.map((memory) =>
      memory.id.endsWith("note") || memory.id.endsWith("bike") || memory.id.endsWith("ex")
        ? { ...memory, status: "deleted" as const }
        : memory,
    );
    const lists = counterfactualLists(forgotten, forgotten[0].id, "Edited claim", false);
    if (lists.without.some((item) => item.id === forgotten[0].id)) throw new Error("without");
    if (!lists.corrected.some((item) => item.claim === "Edited claim")) throw new Error("edited");
    if (labMessages("Hello").length !== 1) throw new Error("isolated");
    const seen = new Set<string>();
    for (const memory of persona.memories) {
      if (seen.has(memory.id)) throw new Error("dup");
      seen.add(memory.id);
      let cursor: Memory | undefined = memory;
      const walk = new Set<string>();
      while (cursor?.supersedesId) {
        if (walk.has(cursor.id)) throw new Error("cycle");
        walk.add(cursor.id);
        cursor = persona.memories.find((item) => item.id === cursor!.supersedesId);
      }
    }
  }
  const later = Date.parse("2026-10-01T00:00:00.000Z");
  const sample = personas[0].memories;
  const at = visibleAt(sample, later);
  if (at.some((memory) => Date.parse(memory.createdAt) > later)) throw new Error("time");
}

assertLineage();
