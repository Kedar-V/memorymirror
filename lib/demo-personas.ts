import type { ChatMessage, Memory, PromptMemory, Relationship } from "./schemas";

export type Persona = {
  id: string;
  name: string;
  role: string;
  blurb: string;
  mistake: string;
  suggested: string[];
  question: string;
  messages: ChatMessage[];
  memories: Memory[];
  links: Relationship[];
  corrected: PromptMemory[];
  watch: string[];
};

function msg(id: string, role: ChatMessage["role"], content: string, createdAt: string, used?: string[]): ChatMessage {
  return { id, role, content, createdAt, usedMemoryIds: used };
}

function mem(
  partial: Pick<Memory, "id" | "claim" | "kind" | "status" | "sourceMessageIds" | "evidence"> & Partial<Memory>,
): Memory {
  return {
    version: 1,
    supersedesId: null,
    supersededById: null,
    priorStatus: null,
    modelReportedConfidence: null,
    createdAt: "2026-03-02T15:00:00.000Z",
    ...partial,
  };
}

function link(
  id: string,
  userId: string,
  sourceId: string,
  targetId: string,
  type: Relationship["type"],
  createdAt: string,
  status: Relationship["status"] = "active",
): Relationship {
  return {
    id,
    userId,
    sourceId,
    targetId,
    type,
    evidenceIds: [],
    kind: "explicit",
    createdAt,
    status,
  };
}

function fan(user: string, specs: { id: string; claim: string; at: string; lines: { quote: string; claim: string }[] }[]) {
  const messages: ChatMessage[] = [];
  const memories: Memory[] = [];
  for (const spec of specs) {
    const explicitIds: string[] = [];
    const messageIds: string[] = [];
    spec.lines.forEach((line, index) => {
      const messageId = `${user}-${spec.id}-m${index}`;
      const explicitId = `${user}-${spec.id}-e${index}`;
      messageIds.push(messageId);
      explicitIds.push(explicitId);
      messages.push(msg(messageId, "user", line.quote, spec.at));
      memories.push(mem({
        id: explicitId,
        claim: line.claim,
        kind: "explicit",
        status: "approved",
        sourceMessageIds: [messageId],
        evidence: [line.quote],
        createdAt: spec.at,
      }));
    });
    const inferenceId = `${user}-inf-${spec.id}`;
    memories.push(mem({
      id: inferenceId,
      claim: spec.claim,
      kind: "inference",
      status: "approved",
      sourceMessageIds: messageIds,
      evidence: spec.lines.map((line) => line.quote),
      derivedFromIds: explicitIds,
      modelReportedConfidence: 0.5,
      createdAt: spec.at,
    }));
    messages.push(msg(`${user}-${spec.id}-a`, "assistant", `The record assumes ${spec.claim}`, spec.at, [inferenceId, ...explicitIds]));
  }
  return { messages, memories };
}

const jordanFan = fan("jordan", [
  { id: "status", claim: "Jordan dislikes long status meetings.", at: "2026-06-04T13:10:00.000Z", lines: [
    { quote: "I prefer shorter meetings.", claim: "Jordan prefers shorter meetings." },
    { quote: "Monday status runs past the hour.", claim: "Jordan's Monday status runs past the hour." },
    { quote: "I leave status meetings drained.", claim: "Jordan leaves status meetings drained." },
  ]},
  { id: "optional", claim: "Jordan skips meetings that are not for a decision.", at: "2026-06-11T13:10:00.000Z", lines: [
    { quote: "I decline optional meetings.", claim: "Jordan declines optional meetings." },
    { quote: "I only attend if a decision is needed.", claim: "Jordan attends when a decision is needed." },
  ]},
  { id: "agenda", claim: "Jordan wants a written agenda before a meeting.", at: "2026-06-18T13:10:00.000Z", lines: [
    { quote: "Send the agenda the day before.", claim: "Jordan wants the agenda the day before." },
    { quote: "I prepare from the agenda.", claim: "Jordan prepares from the agenda." },
    { quote: "Meetings without an agenda wander.", claim: "Jordan thinks meetings without an agenda wander." },
  ]},
  { id: "review", claim: "Jordan wants fewer people in a review.", at: "2026-07-02T13:10:00.000Z", lines: [
    { quote: "Too many people join the review.", claim: "Jordan sees too many people in the review." },
    { quote: "I want the reviewer and the author only.", claim: "Jordan wants only the reviewer and the author." },
  ]},
  { id: "async", claim: "Jordan prefers async updates to a live readout.", at: "2026-07-16T13:10:00.000Z", lines: [
    { quote: "A note is better than a live readout.", claim: "Jordan prefers a note to a live readout." },
    { quote: "I read updates before standup.", claim: "Jordan reads updates before standup." },
    { quote: "I write the Monday note the night before.", claim: "Jordan writes the Monday note the night before." },
  ]},
  { id: "focus", claim: "Jordan protects morning focus time.", at: "2026-08-06T13:10:00.000Z", lines: [
    { quote: "I block 9 to 11 for deep work.", claim: "Jordan blocks 9 to 11 for deep work." },
    { quote: "I do not take calls before noon.", claim: "Jordan does not take calls before noon." },
  ]},
  { id: "stable", claim: "Jordan wants a more stable team than a startup.", at: "2026-08-20T13:10:00.000Z", lines: [
    { quote: "Northwind changed priorities weekly.", claim: "Northwind changed priorities weekly." },
    { quote: "On-call every weekend wore me down.", claim: "Weekend on-call wore Jordan down." },
    { quote: "I started at Harbor Grid last month.", claim: "Jordan works at Harbor Grid." },
  ]},
  { id: "trust", claim: "Jordan trusts the weekly 1:1 with their manager.", at: "2026-09-03T13:10:00.000Z", lines: [
    { quote: "I want a weekly 1:1 with my manager.", claim: "Jordan wants a weekly 1:1 with their manager." },
    { quote: "My manager reads the note before we meet.", claim: "Jordan's manager reads the note first." },
    { quote: "I can disagree in the 1:1.", claim: "Jordan can disagree in the 1:1." },
  ]},
  { id: "social", claim: "Jordan avoids social chat at work.", at: "2026-09-17T13:10:00.000Z", lines: [
    { quote: "I mute the social channel.", claim: "Jordan mutes the social channel." },
    { quote: "I answer work questions in threads.", claim: "Jordan answers work questions in threads." },
    { quote: "I do not join the Friday social.", claim: "Jordan does not join the Friday social." },
  ]},
  { id: "concise", claim: "Jordan prefers concise writing.", at: "2026-10-01T13:10:00.000Z", lines: [
    { quote: "Keep the note to five lines.", claim: "Jordan keeps the note to five lines." },
    { quote: "I skip long preambles.", claim: "Jordan skips long preambles." },
    { quote: "Bullets are easier to scan.", claim: "Jordan finds bullets easier to scan." },
  ]},
  { id: "vision", claim: "Jordan is focused on computer vision outside work.", at: "2026-05-07T13:10:00.000Z", lines: [
    { quote: "I follow computer vision papers.", claim: "Jordan follows computer vision papers." },
    { quote: "I tinker with autonomous-vehicle datasets on weekends.", claim: "Jordan tinkers with autonomous-vehicle datasets." },
  ]},
]);

export const personas: Persona[] = [
  {
    id: "maya",
    name: "Maya Chen",
    role: "Product designer",
    blurb: "Moved from Austin to Brooklyn and stopped eating a vegetarian diet.",
    mistake: "Seeded record: lives in Austin and is vegetarian. The messages say Brooklyn and seafood.",
    suggested: ["Book me a Saturday dinner near home.", "I live in Brooklyn now, and salmon is my usual order."],
    question: "Book me a Saturday dinner near home.",
    messages: [
      msg("maya-m1", "user", "I live in Austin. I am vegetarian.", "2026-03-03T14:00:00.000Z"),
      msg("maya-a1", "assistant", "I have Austin and a vegetarian diet.", "2026-03-03T14:01:00.000Z", ["maya-austin", "maya-veg"]),
      msg("maya-m2", "user", "I cooked at home on Sunday.", "2026-06-06T14:00:00.000Z"),
      msg("maya-a2", "assistant", "The record assumes you only eat at home.", "2026-06-06T14:01:00.000Z", ["maya-home"]),
      msg("maya-m3", "user", "I just moved from Austin to a one-bedroom in Brooklyn. I eat seafood now. Salmon is my usual order.", "2026-08-08T14:00:00.000Z"),
      msg("maya-a3", "assistant", "Brooklyn, and salmon instead of a vegetarian menu.", "2026-08-08T14:01:00.000Z", ["maya-brooklyn", "maya-seafood"]),
      msg("maya-m4", "user", "I bike to the studio when the weather is decent. I live in Brooklyn.", "2026-09-09T14:00:00.000Z"),
      msg("maya-a4", "assistant", "A decent-weather day is a bike day in Brooklyn.", "2026-09-09T14:01:00.000Z", ["maya-bike", "maya-brooklyn"]),
      msg("maya-m5", "user", "I ate at a restaurant called Salt Line. I do not only eat at home.", "2026-10-04T14:00:00.000Z"),
      msg("maya-a5", "assistant", "Salt Line replaces the idea that you only eat at home.", "2026-10-04T14:01:00.000Z", ["maya-out"]),
    ],
    memories: [
      mem({ id: "maya-austin", claim: "Maya lives in Austin.", kind: "explicit", status: "superseded", supersededById: "maya-brooklyn", sourceMessageIds: ["maya-m1"], evidence: ["I live in Austin."], createdAt: "2026-03-03T14:02:00.000Z" }),
      mem({ id: "maya-veg", claim: "Maya is vegetarian.", kind: "explicit", status: "superseded", supersededById: "maya-seafood", sourceMessageIds: ["maya-m1"], evidence: ["I am vegetarian."], createdAt: "2026-03-03T14:03:00.000Z" }),
      mem({ id: "maya-home", claim: "Maya only eats at home.", kind: "inference", status: "superseded", supersededById: "maya-out", sourceMessageIds: ["maya-m2"], evidence: ["I cooked at home on Sunday."], modelReportedConfidence: 0.44, createdAt: "2026-06-06T14:02:00.000Z" }),
      mem({ id: "maya-brooklyn", claim: "Maya lives in Brooklyn.", kind: "explicit", status: "approved", version: 2, supersedesId: "maya-austin", sourceMessageIds: ["maya-m3"], evidence: ["moved from Austin to a one-bedroom in Brooklyn"], createdAt: "2026-08-08T14:02:00.000Z" }),
      mem({ id: "maya-seafood", claim: "Maya eats seafood and usually orders salmon.", kind: "explicit", status: "approved", version: 2, supersedesId: "maya-veg", sourceMessageIds: ["maya-m3"], evidence: ["I eat seafood now. Salmon is my usual order."], createdAt: "2026-08-08T14:03:00.000Z" }),
      mem({ id: "maya-bike", claim: "Maya bikes to the studio when the weather is decent.", kind: "explicit", status: "approved", sourceMessageIds: ["maya-m4"], evidence: ["I bike to the studio when the weather is decent."], createdAt: "2026-09-09T14:02:00.000Z" }),
      mem({ id: "maya-rain", claim: "Maya skips the studio when it rains.", kind: "inference", status: "approved", sourceMessageIds: ["maya-m4"], evidence: ["I bike to the studio when the weather is decent."], modelReportedConfidence: 0.41, createdAt: "2026-09-09T14:03:00.000Z" }),
      mem({ id: "maya-out", claim: "Maya eats at restaurants.", kind: "explicit", status: "approved", version: 2, supersedesId: "maya-home", sourceMessageIds: ["maya-m5"], evidence: ["I ate at a restaurant called Salt Line."], createdAt: "2026-10-04T14:02:00.000Z" }),
    ],
    links: [link("maya-rel-bike", "maya", "maya-brooklyn", "maya-bike", "SUPPORTS", "2026-09-09T14:04:00.000Z")],
    corrected: [
      { id: "maya-fix-home", claim: "Maya lives in Brooklyn.", kind: "explicit", status: "approved" },
      { id: "maya-fix-food", claim: "Maya eats seafood and usually orders salmon.", kind: "explicit", status: "approved" },
      { id: "maya-mem-bike", claim: "Maya bikes to the studio when the weather is decent.", kind: "explicit", status: "approved" },
    ],
    watch: ["Austin", "vegetarian", "Brooklyn", "salmon"],
  },
  {
    id: "jordan",
    name: "Jordan Hale",
    role: "Staff engineer",
    blurb: "Left the startup Northwind for Harbor Grid and wants a weekly 1:1.",
    mistake: "Seeded record: works at Northwind and hates meetings. The messages say Harbor Grid and a weekly 1:1.",
    suggested: ["Draft my Monday calendar note for my manager.", "I work at Harbor Grid and I want a weekly 1:1."],
    question: "Draft my Monday calendar note for my manager.",
    messages: [
      msg("jordan-m1", "user", "I work at Northwind, a startup. I write the Monday note the morning of.", "2026-03-02T13:00:00.000Z"),
      msg("jordan-m3", "user", "I left Northwind, the startup, in March. I started at Harbor Grid last month. I write the Monday note the night before.", "2026-09-01T13:00:00.000Z"),
      msg("jordan-m4", "user", "The Harbor Grid start was 1 September. I do not hate meetings.", "2026-10-02T13:00:00.000Z"),
      ...jordanFan.messages,
    ],
    memories: [
      mem({ id: "jordan-job", claim: "Jordan works at Northwind, a startup.", kind: "explicit", status: "superseded", supersededById: "jordan-harbor2", sourceMessageIds: ["jordan-m1"], evidence: ["I work at Northwind, a startup."], createdAt: "2026-03-02T13:02:00.000Z" }),
      mem({ id: "jordan-harbor2", claim: "Jordan started at Harbor Grid on 1 September.", kind: "explicit", status: "approved", version: 2, supersedesId: "jordan-job", sourceMessageIds: ["jordan-m4"], evidence: ["The Harbor Grid start was 1 September."], createdAt: "2026-10-02T13:02:00.000Z" }),
      ...jordanFan.memories,
    ],
    links: [],
    corrected: [
      { id: "jordan-fix-job", claim: "Jordan works at Harbor Grid.", kind: "explicit", status: "approved" },
      { id: "jordan-fix-meet", claim: "Jordan wants a weekly 1:1 with their manager.", kind: "explicit", status: "approved" },
      { id: "jordan-mem-note", claim: "Jordan writes the Monday note the night before.", kind: "explicit", status: "approved" },
    ],
    watch: ["Northwind", "hate meetings", "Harbor Grid", "1:1"],
  },
  {
    id: "priya",
    name: "Priya Nair",
    role: "Graduate student",
    blurb: "Wants a plain-language explanation of a 95% confidence interval.",
    mistake: "Seeded record: inferred she is bad at math from one stuck lecture. She asked for a plain-language confidence interval.",
    suggested: ["Help me start problem set 4.", "Please explain a confidence interval in plain language. I want the margin of error in the example."],
    question: "Help me start problem set 4.",
    messages: [
      msg("priya-m1", "user", "I am taking the stats course. I want the lecture notes the same day.", "2026-03-05T16:00:00.000Z"),
      msg("priya-a1", "assistant", "Stats course, and lecture notes the same day.", "2026-03-05T16:01:00.000Z", ["priya-course", "priya-notes"]),
      msg("priya-m2", "user", "I am stuck on confidence intervals for problem set 4.", "2026-06-06T16:00:00.000Z"),
      msg("priya-a2", "assistant", "The record assumes you are bad at math from that one stuck topic.", "2026-06-06T16:01:00.000Z", ["priya-math"]),
      msg("priya-m3", "user", "Please explain a 95% confidence interval in plain language. I want a short example with a sample mean and a margin of error.", "2026-08-08T16:00:00.000Z"),
      msg("priya-a3", "assistant", "A plain-language confidence interval, then a short example with a margin of error.", "2026-08-08T16:01:00.000Z", ["priya-ci", "priya-example"]),
      msg("priya-m4", "user", "I am not bad at math. I am auditing the stats course.", "2026-09-09T16:00:00.000Z"),
      msg("priya-a4", "assistant", "Not bad at math. Auditing the stats course.", "2026-09-09T16:01:00.000Z", ["priya-not", "priya-audit"]),
      msg("priya-m5", "user", "I study after dinner.", "2026-10-05T16:00:00.000Z"),
      msg("priya-a5", "assistant", "Study time is after dinner.", "2026-10-05T16:01:00.000Z", ["priya-dinner"]),
    ],
    memories: [
      mem({ id: "priya-course", claim: "Priya is taking the stats course.", kind: "explicit", status: "superseded", supersededById: "priya-audit", sourceMessageIds: ["priya-m1"], evidence: ["I am taking the stats course."], createdAt: "2026-03-05T16:02:00.000Z" }),
      mem({ id: "priya-notes", claim: "Priya wants the lecture notes the same day.", kind: "explicit", status: "approved", sourceMessageIds: ["priya-m1"], evidence: ["I want the lecture notes the same day."], createdAt: "2026-03-05T16:03:00.000Z" }),
      mem({ id: "priya-math", claim: "Priya is bad at math.", kind: "inference", status: "superseded", supersededById: "priya-not", sourceMessageIds: ["priya-m2"], evidence: ["I am stuck on confidence intervals"], modelReportedConfidence: 0.42, createdAt: "2026-06-06T16:02:00.000Z" }),
      mem({ id: "priya-behind", claim: "Priya is behind in the stats course.", kind: "inference", status: "approved", sourceMessageIds: ["priya-m2"], evidence: ["I am stuck on confidence intervals for problem set 4."], modelReportedConfidence: 0.46, createdAt: "2026-06-06T16:03:00.000Z" }),
      mem({ id: "priya-ci", claim: "Priya wants a plain-language explanation of a 95% confidence interval.", kind: "explicit", status: "approved", sourceMessageIds: ["priya-m3"], evidence: ["explain a 95% confidence interval in plain language"], createdAt: "2026-08-08T16:02:00.000Z" }),
      mem({ id: "priya-example", claim: "Priya wants a short example with a sample mean and a margin of error.", kind: "explicit", status: "approved", sourceMessageIds: ["priya-m3"], evidence: ["I want a short example with a sample mean and a margin of error."], createdAt: "2026-08-08T16:03:00.000Z" }),
      mem({ id: "priya-not", claim: "Priya is not bad at math.", kind: "explicit", status: "approved", version: 2, supersedesId: "priya-math", sourceMessageIds: ["priya-m4"], evidence: ["I am not bad at math."], createdAt: "2026-09-09T16:02:00.000Z" }),
      mem({ id: "priya-audit", claim: "Priya is auditing the stats course.", kind: "explicit", status: "approved", version: 2, supersedesId: "priya-course", sourceMessageIds: ["priya-m4"], evidence: ["I am auditing the stats course."], createdAt: "2026-09-09T16:03:00.000Z" }),
      mem({ id: "priya-dinner", claim: "Priya studies after dinner.", kind: "explicit", status: "approved", sourceMessageIds: ["priya-m5"], evidence: ["I study after dinner."], createdAt: "2026-10-05T16:02:00.000Z" }),
    ],
    links: [link("priya-rel-support", "priya", "priya-ci", "priya-example", "SUPPORTS", "2026-08-08T16:04:00.000Z")],
    corrected: [
      { id: "priya-mem-ci", claim: "Priya wants a plain-language explanation of a 95% confidence interval.", kind: "explicit", status: "approved" },
      { id: "priya-mem-ex", claim: "Priya wants a short example with a sample mean and a margin of error.", kind: "explicit", status: "approved" },
    ],
    watch: ["bad at math", "confidence interval"],
  },
  {
    id: "imported",
    name: "Imported conversations",
    role: "Local demo",
    blurb: "Beliefs extracted from a file on this browser.",
    mistake: "Nothing is seeded. Beliefs come from the file you import.",
    suggested: [],
    question: "What do you know about me?",
    messages: [],
    memories: [],
    links: [],
    corrected: [],
    watch: [],
  },
  {
    id: "sample",
    name: "Sample import",
    role: "Local demo",
    blurb: "A synthetic transcript run through the same parser as an upload.",
    mistake: "Nothing is seeded until you load the sample.",
    suggested: [],
    question: "What should I keep in mind about work?",
    messages: [],
    memories: [],
    links: [],
    corrected: [],
    watch: ["Northwind", "Harbor Grid", "meetings"],
  },
];

export function getPersona(id: string) {
  return personas.find((persona) => persona.id === id) ?? personas[0];
}

export function promptFromMemories(memories: Memory[]): PromptMemory[] {
  return memories
    .filter((memory) => memory.status === "approved" || memory.status === "candidate")
    .map((memory) => ({
      id: memory.id,
      claim: memory.claim,
      kind: memory.kind,
      status: memory.status as "approved" | "candidate",
    }));
}
