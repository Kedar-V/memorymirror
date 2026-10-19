import { complete, hasModelKey, publicError } from "@/lib/llm";
import { chatRequestSchema, type PromptMemory } from "@/lib/schemas";
import { simulateReply } from "@/lib/simulate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function systemPrompt(memories: PromptMemory[]) {
  const lines = memories.map(
    (memory) => `- (${memory.status}, ${memory.kind}) ${memory.claim}`,
  );
  return [
    "You are a personal assistant in a memory study.",
    "Personalize only from the stored memories listed below.",
    "Approved memories are the current record. Use them even if the transcript conflicts with them. This study is about what that record does to the answer.",
    "Candidate memories are unverified. Use one only if needed and say it is unverified.",
    "Do not invent personal facts.",
    "Do not infer or mention health, race, ethnicity, religion, sexuality, politics, a street address, finances, or biometrics.",
    "If the record is empty, say so and answer only in general terms.",
    "Stored memories:",
    lines.length ? lines.join("\n") : "(none)",
  ].join("\n");
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "The request does not match the expected shape or is over the size limit." },
      { status: 400 },
    );
  }
  const { messages, memories } = parsed.data;
  if (messages[messages.length - 1]?.role !== "user") {
    return Response.json({ error: "Send a user message last." }, { status: 400 });
  }
  if (!hasModelKey()) {
    return Response.json({
      reply: simulateReply(memories),
      simulated: true,
      model: "fixture",
      temperature: null,
    });
  }
  try {
    const reply = await complete([
      { role: "system", content: systemPrompt(memories) },
      ...messages.map((message) => ({ role: message.role, content: message.content })),
    ]);
    return Response.json({
      reply: reply.text,
      simulated: false,
      model: reply.model,
      temperature: null,
    });
  } catch (error) {
    return Response.json({ error: publicError(error) }, { status: 502 });
  }
}
