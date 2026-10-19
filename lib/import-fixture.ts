import { buildProfile } from "./profile";
import { parseTranscript } from "./parse-transcript";
import { conflicts } from "./lineage";
import { activeClaims, forget, reconcile, supersede } from "./reconcile";
import { evidenceQuoted, unsupportedQuote, type ChatMessage, type Memory } from "./schemas";
import { materializeExtractions, simulateExtract } from "./simulate";

export const SAMPLE_TRANSCRIPT = JSON.stringify([
  {
    id: "work",
    title: "Work",
    messages: [
      { id: "u1", role: "user", content: "I worked at Northwind.", createdAt: "2026-03-02T15:00:00.000Z" },
      { id: "a1", role: "assistant", content: "Northwind is on the record.", createdAt: "2026-03-02T15:01:00.000Z" },
      { id: "u2", role: "user", content: "I worked at Northwind.", createdAt: "2026-04-02T15:00:00.000Z" },
      { id: "u3", role: "user", content: "I left Northwind in March. I now work at Harbor Grid.", createdAt: "2026-10-02T15:00:00.000Z" },
      { id: "u4", role: "user", content: "I prefer short, focused meetings.", createdAt: "2026-10-03T15:00:00.000Z" },
      { id: "u5", role: "user", content: "I prefer long weekly meetings.", createdAt: "2026-05-02T15:00:00.000Z" },
      { id: "u6", role: "user", content: "What if I moved to Austin next year?", createdAt: "2026-10-04T15:00:00.000Z" },
      { id: "u7", role: "user", content: "I think my friend works at a bank downtown.", createdAt: "2026-10-04T16:00:00.000Z" },
      { id: "u8", role: "user", content: "I studied at Reed College.", createdAt: "" },
      { id: "u9", role: "user", content: "I live in Austin.", createdAt: "2026-01-02T15:00:00.000Z" },
      { id: "u10", role: "user", content: "I live in Brooklyn now.", createdAt: "2026-09-02T15:00:00.000Z" },
      { id: "u11", role: "user", content: "A post said \"I live in Paris and I love the rain.\"", createdAt: "2026-09-03T15:00:00.000Z" },
      { id: "empty", role: "user", content: "", createdAt: "2026-01-01T00:00:00.000Z" },
    ],
  },
]);

function localExtract(messages: ChatMessage[]) {
  const memories: Memory[] = [];
  let dropped = 0;
  for (const message of messages) {
    if (message.role !== "user") continue;
    const result = simulateExtract([message]);
    memories.push(...result.memories);
    dropped += result.dropped;
  }
  return { memories, dropped };
}

export function runSample() {
  const parsed = parseTranscript(SAMPLE_TRANSCRIPT, "sample.json", "sample-batch");
  const messages = parsed.conversations.flatMap((conversation) => conversation.messages);
  const extracted = localExtract(messages);
  return { parsed, messages, dropped: extracted.dropped, ...reconcile(extracted.memories, messages, [], "sample") };
}

function selfCheck() {
  const chatgpt = parseTranscript(JSON.stringify([{
    title: "Branch",
    current_node: "c",
    mapping: {
      root: { id: "root", parent: null, children: ["a"], message: { author: { role: "system" }, content: { content_type: "text", parts: ["You are ChatGPT."] } } },
      a: { id: "a", parent: "root", children: ["b", "d"], message: { author: { role: "user" }, content: { content_type: "text", parts: ["I studied at Reed College."] }, create_time: 1700000000 } },
      b: { id: "b", parent: "a", children: ["c"], message: { author: { role: "assistant" }, content: { content_type: "text", parts: ["Reed College, noted."] }, create_time: 1700000001 } },
      c: { id: "c", parent: "b", children: [], message: { author: { role: "user" }, content: { content_type: "text", parts: ["I prefer short, focused meetings."] }, create_time: 1700000002 } },
      d: { id: "d", parent: "a", children: [], message: { author: { role: "assistant" }, content: { content_type: "text", parts: ["Alternate branch."] } } },
      tool: { id: "tool", parent: "b", children: [], message: { author: { role: "tool" }, content: { content_type: "text", parts: ["tool output should skip"] } } },
    },
  }]), "conversations.json", "cg-batch");
  const heard = chatgpt.conversations[0]?.messages.map((message) => message.content).join("\n") ?? "";
  if (!heard.includes("Reed College") || !heard.includes("short, focused meetings")) throw new Error("chatgpt path");
  if (/ChatGPT\.|Alternate branch|tool output/.test(heard)) throw new Error("chatgpt skip");
  if (!chatgpt.conversations[0]?.branchIds.length) throw new Error("branch");

  const text = parseTranscript("User: I studied at Reed College.\nAssistant: Noted.", "notes.txt", "txt-batch");
  if (text.format !== "text" || text.conversations[0]?.messages.length !== 2) throw new Error("text");

  const csv = parseTranscript("role,message,timestamp\nuser,I studied at Reed College.,\nassistant,Noted,2026-01-01T00:00:00.000Z\n", "rows.csv", "csv-batch");
  const csvUser = csv.conversations[0]?.messages.find((message) => message.role === "user");
  if (!csvUser || csvUser.createdAt !== "") throw new Error("csv date");

  const sample = runSample();
  const blob = (memory: Memory) => `${memory.claim} ${memory.evidence.join(" ")}`;
  if (sample.messages.some((message) => /Reed College/.test(message.content) && message.createdAt)) throw new Error("invented date");
  if (sample.memories.some((memory) => /friend|Paris|next year/.test(blob(memory)))) throw new Error("dropped context");
  const north = sample.memories.find((memory) => /worked at Northwind/i.test(memory.claim));
  const harbor = sample.memories.find((memory) => /Harbor Grid/i.test(memory.claim) && !/Northwind/i.test(memory.claim));
  if (!north || north.sourceMessageIds.length < 2 || !north.validTo?.startsWith("2026-03")) throw new Error("northwind");
  if (!harbor || conflicts([north, harbor]).length) throw new Error("transition");
  if (!sample.relationships.some((item) => /left Northwind/.test(item.explanation ?? ""))) throw new Error("job link");
  const guess = sample.memories.find((memory) => /dislikes meetings/i.test(memory.claim));
  if (!guess || guess.kind !== "inference" || guess.status !== "candidate") throw new Error("assumption");
  if (buildProfile("sample", [guess]).statements[0]?.category !== "Needs a look") throw new Error("review");
  const reed = sample.memories.find((memory) => /Reed College/.test(memory.claim));
  if (reed?.facet !== "education") throw new Error("facet");
  for (const memory of sample.memories) {
    const message = sample.messages.find((item) => item.id === memory.sourceMessageIds[0]);
    if (!message || !memory.evidence.some((quote) => evidenceQuoted(quote, message.content))) throw new Error(`provenance ${memory.claim}`);
  }
  const austin = sample.memories.find((memory) => /Austin/.test(memory.claim));
  const brooklyn = sample.memories.find((memory) => /Brooklyn/.test(memory.claim));
  if (!austin || !brooklyn || !conflicts([austin, brooklyn]).length) throw new Error("contradiction");
  const long = sample.memories.find((memory) => /long weekly meetings/.test(memory.claim));
  const short = sample.memories.find((memory) => /short, focused meetings/.test(memory.claim));
  if (!long || !short) throw new Error("preferences");
  const revised = supersede(sample.memories, long.id, "The user prefers short meetings.", "2026-10-16T00:00:00.000Z");
  if (!activeClaims(revised).includes("The user prefers short meetings.")) throw new Error("correction");
  if (revised.find((memory) => memory.id === long.id)?.status !== "superseded") throw new Error("old version");
  const forgotten = forget(revised, guess.id);
  if (activeClaims(forgotten).some((claim) => /dislikes meetings/i.test(claim))) throw new Error("forget prompt");
  if (buildProfile("sample", forgotten).statements.some((statement) => statement.memoryIds.includes(guess.id))) throw new Error("forget profile");

  const quoted = materializeExtractions([
    { claim: "The user lives in Paris.", kind: "explicit", evidenceQuote: "I live in Paris and I love the rain", sourceMessageId: "q" },
  ], [{ id: "q", role: "user", content: 'A post said "I live in Paris and I love the rain."' }]);
  if (quoted.memories.length || !unsupportedQuote("I live in Paris and I love the rain", 'A post said "I live in Paris and I love the rain."')) {
    throw new Error("quotation");
  }

  const linked = materializeExtractions([
    { ref: "m1", claim: "Runs at 5:30am.", kind: "explicit", evidenceQuote: "I run at 5:30 every morning", sourceMessageId: "r" },
    { ref: "m2", claim: "Is a morning person.", kind: "inference", evidenceQuote: "I run at 5:30 every morning", sourceMessageId: "r", parentMemoryId: "m1" },
    { claim: "Likes routine.", kind: "inference", evidenceQuote: "I run at 5:30 every morning", sourceMessageId: "r", parentMemoryId: "missing" },
  ], [{ id: "r", role: "user", content: "I run at 5:30 every morning." }]).memories;
  if (linked[1]?.derivedFromIds?.[0] !== linked[0]?.id || linked[2]?.derivedFromIds) throw new Error("parent ref");
}

selfCheck();
