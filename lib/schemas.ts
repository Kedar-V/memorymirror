import { z } from "zod";

export const EXTRACTION_VERSION = 1;

export const memoryKindSchema = z.enum(["explicit", "inference"]);
export const facetSchema = z.enum([
  "background",
  "education",
  "employment",
  "skills",
  "interests",
  "likes",
  "goals",
  "preferences",
  "experience",
  "event",
  "decision",
  "style",
]);
export const memoryStatusSchema = z.enum([
  "candidate",
  "approved",
  "superseded",
  "deleted",
]);

export const memorySchema = z.object({
  id: z.string().min(1).max(80),
  claim: z.string().min(1).max(500),
  kind: memoryKindSchema,
  status: memoryStatusSchema,
  sourceMessageIds: z.array(z.string().min(1).max(80)).max(8),
  evidence: z.array(z.string().min(1).max(500)).max(8),
  version: z.number().int().min(1).max(100),
  supersedesId: z.string().min(1).max(80).nullable(),
  supersededById: z.string().min(1).max(80).nullable(),
  priorStatus: memoryStatusSchema.nullable(),
  modelReportedConfidence: z.number().min(0).max(1).nullable(),
  createdAt: z.string().min(1).max(40),
  validFrom: z.string().min(1).max(40).optional(),
  validTo: z.string().min(1).max(40).optional(),
  derivedFromIds: z.array(z.string().min(1).max(80)).max(6).optional(),
  facet: facetSchema.optional(),
  extractionModel: z.string().min(1).max(80).optional(),
  extractedAt: z.string().min(1).max(40).optional(),
  extractionVersion: z.number().int().min(1).max(20).optional(),
});

export type Memory = z.infer<typeof memorySchema>;

export const messageSchema = z.object({
  id: z.string().min(1).max(80),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
  createdAt: z.string().max(40),
  simulated: z.boolean().optional(),
  usedMemoryIds: z.array(z.string().min(1).max(80)).max(40).optional(),
  conversationId: z.string().min(1).max(80).optional(),
  title: z.string().min(1).max(120).optional(),
  sourceRef: z.string().min(1).max(200).optional(),
  importBatchId: z.string().min(1).max(80).optional(),
});

export type ChatMessage = z.infer<typeof messageSchema>;

export const promptMemorySchema = z.object({
  id: z.string().min(1).max(80),
  claim: z.string().min(1).max(500),
  kind: memoryKindSchema,
  status: z.enum(["approved", "candidate"]),
});

export type PromptMemory = z.infer<typeof promptMemorySchema>;

const wireMessage = z.object({
  id: z.string().min(1).max(80),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

export const chatRequestSchema = z.object({
  messages: z.array(wireMessage).min(1).max(40),
  memories: z.array(promptMemorySchema).max(40),
});

export const extractRequestSchema = z.object({
  messages: z.array(wireMessage).min(1).max(40),
});

export const extractedItemSchema = z.object({
  claim: z.string().min(1).max(500),
  kind: memoryKindSchema,
  evidenceQuote: z.string().min(1).max(500),
  sourceMessageId: z.string().min(1).max(80),
  modelReportedConfidence: z.number().min(0).max(1).nullable().optional(),
  facet: facetSchema.optional(),
  validFrom: z.string().max(40).optional(),
  validTo: z.string().max(40).optional(),
  parentMemoryId: z.string().min(1).max(80).optional(),
});

export const extractedRelationSchema = z.object({
  type: z.enum(["SUPPORTS", "CONTRADICTS", "RELATED_TO", "INFERRED_FROM"]),
  sourceClaim: z.string().min(1).max(500),
  targetClaim: z.string().min(1).max(500),
  evidenceQuote: z.string().min(1).max(500),
  sourceMessageId: z.string().min(1).max(80),
  kind: memoryKindSchema,
  explanation: z.string().max(300).optional(),
});

export type ExtractedRelation = z.infer<typeof extractedRelationSchema>;

export function normText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function evidenceQuoted(quote: string, content: string) {
  const q = normText(quote);
  // ponytail: 12-char floor drops one-word quotes; raise only if short quotes become necessary
  return q.length >= 12 && normText(content).includes(q);
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export function statedTime(value: string | undefined, content: string) {
  if (!value || Number.isNaN(Date.parse(value))) return undefined;
  const text = content.toLowerCase();
  const when = new Date(value);
  const year = String(when.getUTCFullYear());
  const month = MONTHS[when.getUTCMonth()] ?? "";
  if (text.includes(year) || (month && text.includes(month.slice(0, 3)))) return value;
  return undefined;
}

export function unsupportedQuote(quote: string, content: string) {
  const text = normText(content);
  if (/\b(what if|hypothetically)\b/.test(text)) return true;
  if (/\b(my friend|someone said|a friend of mine|a post said|he wrote|she wrote)\b/.test(text)) return true;
  const q = normText(quote);
  const wrapped = /["“]([^"”]{12,})["”]/g;
  let match: RegExpExecArray | null;
  while ((match = wrapped.exec(content))) {
    if (normText(match[1]).includes(q)) return true;
  }
  return false;
}

const SENSITIVE = [
  /\b(anxiety|anxious|depression|depressed|bipolar|ptsd|adhd|ocd|diagnos\w*|disorder|suicidal|self-harm|therapy|therapist|medication|antidepressant)\b/i,
  /\b(gay|lesbian|bisexual|transgender|transsexual|queer|asexual|sexuality|sexual orientation)\b/i,
  /\b(christian|muslim|jewish|hindu|buddhist|atheist|catholic|protestant|religious|religion)\b/i,
  /\b(democrat|republican|libertarian|political party|how I vote|voted for)\b/i,
  /\b(social security|bank account|credit card|routing number|salary is|my income)\b/i,
  /\b(ssn|passport number)\b/i,
  /\b\d{1,5}\s+[A-Za-z0-9.' ]+\s+(street|st\.|avenue|ave\.|road|rd\.|boulevard|blvd)\b/i,
  /\b(fingerprint|retina|biometric|facial recognition)\b/i,
  /\b(race|racial|ethnicity|ethnic)\b/i,
];

export function isSensitiveClaim(value: string) {
  return SENSITIVE.some((pattern) => pattern.test(value));
}

export const edgeTypeSchema = z.enum([
  "EXTRACTED_FROM",
  "INFERRED_FROM",
  "SUPPORTS",
  "CONTRADICTS",
  "RELATED_TO",
  "SUPERSEDES",
  "AMENDS",
  "USED_IN",
  "SUMMARIZED_IN",
]);

export type EdgeType = z.infer<typeof edgeTypeSchema>;

export const relationshipSchema = z.object({
  id: z.string().min(1).max(80),
  userId: z.string().min(1).max(40),
  sourceId: z.string().min(1).max(80),
  targetId: z.string().min(1).max(80),
  type: edgeTypeSchema,
  evidenceIds: z.array(z.string().min(1).max(80)).max(8),
  kind: memoryKindSchema,
  createdAt: z.string().min(1).max(40),
  status: z.enum(["active", "removed"]),
  explanation: z.string().max(300).optional(),
});

export type Relationship = z.infer<typeof relationshipSchema>;
