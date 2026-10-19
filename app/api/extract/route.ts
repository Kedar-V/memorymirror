import { complete, hasModelKey, modelSettings, publicError } from "@/lib/llm";
import { evidenceQuoted, extractRequestSchema, extractedRelationSchema } from "@/lib/schemas";
import { materializeExtractions, simulateExtract } from "@/lib/simulate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXTRACT_SYSTEM = [
  "Extract durable candidate memories from the user's words.",
  "Return JSON only, with this shape:",
  '{"memories":[{"ref":"m1","claim":"string","kind":"explicit"|"inference","evidenceQuote":"exact substring of one user message","sourceMessageId":"id from the transcript","modelReportedConfidence":0.0,"facet":"background"|"education"|"employment"|"skills"|"interests"|"likes"|"goals"|"preferences"|"experience"|"event"|"decision"|"style","validFrom":"ISO-8601 only if the user stated that time","validTo":"ISO-8601 only if the user stated that time","parentMemoryId":"ref of the memory in this response that an inference builds on"}],"relationships":[{"type":"SUPPORTS"|"CONTRADICTS"|"RELATED_TO"|"INFERRED_FROM","sourceClaim":"string","targetClaim":"string","evidenceQuote":"exact substring","sourceMessageId":"id","kind":"explicit"|"inference","explanation":"short"}]}',
  "kind is explicit only when the user stated the claim. kind is inference when you are reading past the words.",
  "An inference must include parentMemoryId or sourceMessageId. Do not turn a hypothetical, a quotation, or a fact about someone else into a personal memory.",
  "Set validFrom or validTo only when the user stated that time. Omit them otherwise.",
  "evidenceQuote must be copied from that user message, at least 12 characters.",
  "Do not infer health, race, ethnicity, religion, sexuality, politics, a street address, finances, or biometrics. Omit those entirely.",
  "Do not store a question as a belief. Return an empty memories array when nothing durable was stated.",
  "Also add 2 to 4 inferences when the transcript supports them: a preference, habit, goal, or trait the user never stated but that their words suggest. Pick the ones a reasonable person might question. Set modelReportedConfidence honestly, below 0.45 when the evidence is a single passing remark. Point parentMemoryId at the ref of an explicit memory it builds on when there is one.",
  "At most 12 explicit memories plus up to 4 inferences.",
].join("\n");

function parseModelJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

export async function GET() {
  if (!hasModelKey()) return Response.json({ provider: "fixture", model: "fixture" });
  return Response.json({ provider: "cursor", model: modelSettings().model });
}

function relationsFrom(raw: unknown, messages: { id: string; role: string; content: string }[]) {
  const list = raw && typeof raw === "object" && "relationships" in raw ? (raw as { relationships?: unknown }).relationships : [];
  if (!Array.isArray(list)) return [];
  const kept = [];
  for (const item of list.slice(0, 12)) {
    const parsed = extractedRelationSchema.safeParse(item);
    if (!parsed.success) continue;
    const source = messages.find((message) => message.id === parsed.data.sourceMessageId && message.role === "user");
    if (!source || !evidenceQuoted(parsed.data.evidenceQuote, source.content)) continue;
    kept.push(parsed.data);
  }
  return kept;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = extractRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "The request does not match the expected shape or is over the size limit." },
      { status: 400 },
    );
  }
  const { messages } = parsed.data;
  if (!hasModelKey()) {
    const result = simulateExtract(messages);
    return Response.json({ ...result, relations: [], simulated: true, model: "fixture" });
  }
  const transcript = messages
    .map((message) => `[id=${message.id} role=${message.role}]\n${message.content}`)
    .join("\n\n");
  try {
    const completed = await complete([
      { role: "system", content: EXTRACT_SYSTEM },
      { role: "user", content: transcript },
    ]);
    const text = completed.text;
    let raw: unknown;
    try {
      raw = parseModelJson(text);
    } catch {
      return Response.json(
        { error: "The model did not return valid memory JSON." },
        { status: 502 },
      );
    }
    const list = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object" && "memories" in raw
        ? (raw as { memories?: unknown }).memories
        : null;
    if (!Array.isArray(list)) {
      return Response.json(
        { error: "The model did not return a memories array." },
        { status: 502 },
      );
    }
    const result = materializeExtractions(list.slice(0, 24), messages, completed.model);
    return Response.json({ ...result, relations: relationsFrom(raw, messages), simulated: false, model: completed.model });
  } catch (error) {
    return Response.json({ error: publicError(error) }, { status: 502 });
  }
}
