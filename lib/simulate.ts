import {
  EXTRACTION_VERSION,
  evidenceQuoted,
  extractedItemSchema,
  isSensitiveClaim,
  memorySchema,
  statedTime,
  unsupportedQuote,
  type Memory,
} from "./schemas";

const FIXTURE_NOTE = "Simulated fixture: no model was called.";

type Flags = {
  austin: boolean;
  brooklyn: boolean;
  veg: boolean;
  seafood: boolean;
  northwind: boolean;
  harbor: boolean;
  hates: boolean;
  oneOnOne: boolean;
  badMath: boolean;
  ci: boolean;
};

function flagsFor(memories: { claim: string }[]): Flags {
  const has = (pattern: RegExp) => memories.some((memory) => pattern.test(memory.claim));
  return {
    austin: has(/\baustin\b/i),
    brooklyn: has(/\bbrooklyn\b/i),
    veg: has(/\bvegetarian\b/i),
    seafood: has(/\bseafood\b|\bsalmon\b/i),
    northwind: has(/\bnorthwind\b/i),
    harbor: has(/\bharbor grid\b/i),
    hates: has(/\bhates meetings\b|\bhate meetings\b/i),
    oneOnOne: has(/\b1:1\b/i),
    badMath: has(/\bbad at math\b/i),
    ci: has(/\bconfidence interval\b/i),
  };
}

export function simulateReply(memories: { claim: string }[]) {
  const flags = flagsFor(memories);
  const has = (pattern: RegExp) => memories.some((memory) => pattern.test(memory.claim));
  if (flags.badMath) {
    return `The stored memory says you are bad at math, so I would skip the definition and hand you a formula for problem set 4 with almost no explanation. ${FIXTURE_NOTE}`;
  }
  if (flags.brooklyn && flags.seafood && !flags.austin && !flags.veg) {
    return `The stored memory says you live in Brooklyn and eat seafood, so I would book Saturday dinner in Brooklyn and ask for salmon. ${FIXTURE_NOTE}`;
  }
  if ((flags.austin || flags.veg) && (flags.brooklyn || flags.seafood)) {
    const older = [flags.austin ? "you live in Austin" : "", flags.veg ? "you are vegetarian" : ""].filter(Boolean);
    const newer = [flags.brooklyn ? "you live in Brooklyn" : "", flags.seafood ? "salmon is an order" : ""].filter(Boolean);
    return `The stored record conflicts. It says ${older.join(" and ")}. It also says ${newer.join(" and ")}. I will not book a dinner until you correct or delete the older record. ${FIXTURE_NOTE}`;
  }
  if (flags.austin || flags.veg) {
    const bits = [
      flags.austin ? "you live in Austin" : "",
      flags.veg ? "you are vegetarian" : "",
    ].filter(Boolean);
    const meal = flags.veg ? "a vegetarian dinner" : "dinner";
    const place = flags.austin ? "Austin" : "your current city";
    return `The stored memory says ${bits.join(" and ")}, so I would book ${meal} in ${place}. ${FIXTURE_NOTE}`;
  }
  if (flags.harbor && flags.oneOnOne && !flags.northwind && !flags.hates) {
    return `The stored memory says you work at Harbor Grid and want a weekly 1:1. I would draft the Monday note with a 1:1 for your manager. ${FIXTURE_NOTE}`;
  }
  if ((flags.northwind || flags.hates) && (flags.harbor || flags.oneOnOne)) {
    const older = [flags.northwind ? "you work at Northwind" : "", flags.hates ? "you hate meetings" : ""].filter(Boolean);
    const newer = [flags.harbor ? "you work at Harbor Grid" : "", flags.oneOnOne ? "you want a weekly 1:1" : ""].filter(Boolean);
    return `The stored record conflicts. It says ${older.join(" and ")}. It also says ${newer.join(" and ")}. I will not draft the Monday note until you correct or delete the older record. ${FIXTURE_NOTE}`;
  }
  if (flags.northwind || flags.hates) {
    const bits = [
      flags.northwind ? "you work at Northwind" : "",
      flags.hates ? "you hate meetings" : "",
    ].filter(Boolean);
    return `The stored memory says ${bits.join(" and ")}, so the Monday note stays empty and does not add a manager meeting. ${FIXTURE_NOTE}`;
  }
  if (flags.ci) {
    return `You asked for a plain-language confidence interval. A confidence interval is a range around a sample mean, and the margin of error is how far that range reaches. For problem set 4, write the sample mean, the margin of error, and the two endpoints. I am not deciding how you feel. ${FIXTURE_NOTE}`;
  }
  if (has(/remote or office|office-based/i)) {
    return `The stored memory says you are open to remote or office-based work, so I would compare the two offers on the role and team, not the location. ${FIXTURE_NOTE}`;
  }
  if (has(/\bremote\b/i)) {
    return `The stored memory says you prefer remote work, so I would prioritize the offer with the most work-from-home time. ${FIXTURE_NOTE}`;
  }
  if (memories.length === 0) {
    return `I have no active memories in this snapshot, so I will not invent a personal fact. ${FIXTURE_NOTE}`;
  }
  return `I will personalize only from these stored memories: ${memories.map((memory) => memory.claim).join(" ")} ${FIXTURE_NOTE}`;
}

type WireMessage = { id: string; role: "user" | "assistant"; content: string };

const RULES: { test: (text: string) => boolean; claim: string }[] = [
  { test: (text) => /live in brooklyn/i.test(text), claim: "The user lives in Brooklyn." },
  {
    test: (text) => /salmon|seafood/i.test(text),
    claim: "The user eats seafood and usually orders salmon.",
  },
  { test: (text) => /harbor grid/i.test(text), claim: "The user works at Harbor Grid." },
  {
    test: (text) => /1:1|one-on-one|one on one/i.test(text),
    claim: "The user wants a weekly 1:1 with their manager.",
  },
  {
    test: (text) => /confidence interval/i.test(text),
    claim: "The user wants a plain-language explanation of a confidence interval.",
  },
  {
    test: (text) => /margin of error/i.test(text),
    claim: "The user wants a short example with a margin of error.",
  },
];

function candidate(message: WireMessage, claim: string, quote: string): Memory | null {
  if (isSensitiveClaim(claim) || isSensitiveClaim(quote)) return null;
  if (!evidenceQuoted(quote, message.content)) return null;
  const parsed = memorySchema.safeParse({
    id: `ex-${crypto.randomUUID()}`,
    claim,
    kind: "explicit",
    status: "candidate",
    sourceMessageIds: [message.id],
    evidence: [quote.slice(0, 500)],
    version: 1,
    supersedesId: null,
    supersededById: null,
    priorStatus: null,
    modelReportedConfidence: null,
    createdAt: new Date().toISOString(),
    extractionModel: "fixture",
    extractedAt: new Date().toISOString(),
    extractionVersion: EXTRACTION_VERSION,
  });
  return parsed.success ? parsed.data : null;
}

export function simulateExtract(messages: WireMessage[]) {
  const last = [...messages].reverse().find((message) => message.role === "user");
  if (!last || last.content.trim().length < 12) return { memories: [] as Memory[], dropped: 0 };
  const text = last.content.trim();
  if (unsupportedQuote(text, text) || /^(book|help|draft|write|what|how|where|should|introduce|give|explain|my old|someone)\b/i.test(text)) {
    return { memories: [] as Memory[], dropped: 1 };
  }
  let dropped = 0;
  const memories: Memory[] = [];
  const matched = RULES.filter((rule) => rule.test(text));
  const claims = matched.length
    ? matched.map((rule) => rule.claim)
    : /^\s*I\b/.test(text)
      ? [text.slice(0, 240)]
      : [];
  for (const claim of claims) {
    if (memories.length >= 12) break;
    if (isSensitiveClaim(claim) || isSensitiveClaim(text)) {
      dropped += 1;
      continue;
    }
    const quote = text.slice(0, 500);
    const row = candidate(last, claim, quote);
    if (row) memories.push(row);
    else dropped += 1;
  }
  return { memories, dropped };
}

export function materializeExtractions(items: unknown[], messages: WireMessage[], model = "fixture") {
  const memories: Memory[] = [];
  let dropped = 0;
  for (const item of items) {
    if (memories.length >= 12) break;
    const parsed = extractedItemSchema.safeParse(item);
    if (!parsed.success) {
      dropped += 1;
      continue;
    }
    const source = messages.find(
      (message) => message.id === parsed.data.sourceMessageId && message.role === "user",
    );
    if (!source || !evidenceQuoted(parsed.data.evidenceQuote, source.content)) {
      dropped += 1;
      continue;
    }
    if (unsupportedQuote(parsed.data.evidenceQuote, source.content)) {
      dropped += 1;
      continue;
    }
    if (parsed.data.kind === "inference" && !parsed.data.parentMemoryId && !source.id) {
      dropped += 1;
      continue;
    }
    if (isSensitiveClaim(parsed.data.claim) || isSensitiveClaim(parsed.data.evidenceQuote)) {
      dropped += 1;
      continue;
    }
    const now = new Date().toISOString();
    const row = memorySchema.safeParse({
      id: `ex-${crypto.randomUUID()}`,
      claim: parsed.data.claim,
      kind: parsed.data.kind,
      status: "candidate",
      sourceMessageIds: [source.id],
      evidence: [parsed.data.evidenceQuote],
      version: 1,
      supersedesId: null,
      supersededById: null,
      priorStatus: null,
      modelReportedConfidence: parsed.data.modelReportedConfidence ?? null,
      createdAt: now,
      facet: parsed.data.facet,
      validFrom: statedTime(parsed.data.validFrom, source.content),
      validTo: statedTime(parsed.data.validTo, source.content),
      derivedFromIds: parsed.data.parentMemoryId ? [parsed.data.parentMemoryId] : undefined,
      extractionModel: model,
      extractedAt: now,
      extractionVersion: EXTRACTION_VERSION,
    });
    if (!row.success) dropped += 1;
    else memories.push(row.data);
  }
  return { memories, dropped };
}
