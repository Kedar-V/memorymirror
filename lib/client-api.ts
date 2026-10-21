import type { PromptMemory } from "./schemas";
import { simulateExtract, simulateReply } from "./simulate";

// The GitHub Pages build has no server, so model calls are disabled and the fixtures answer instead.
export const STATIC_DEMO = process.env.NEXT_PUBLIC_STATIC_DEMO === "1";

function offline(url: string, body?: unknown): unknown {
  if (url === "/api/chat") {
    const { memories } = body as { memories: PromptMemory[] };
    return { reply: simulateReply(memories), simulated: true, model: "fixture", temperature: null };
  }
  if (url === "/api/extract" && body) {
    const { messages } = body as { messages: Parameters<typeof simulateExtract>[0] };
    return { ...simulateExtract(messages), relations: [], simulated: true, model: "fixture" };
  }
  return { provider: "fixture", model: "fixture" };
}

export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  if (STATIC_DEMO) return offline(url, body) as T;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("The request failed before a reply came back.");
  }
  return read<T>(res);
}

export async function getJson<T>(url: string): Promise<T> {
  if (STATIC_DEMO) return offline(url) as T;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("The request failed before a reply came back.");
  }
  return read<T>(res);
}

async function read<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) {
    throw new Error(data?.error || `The request failed (${res.status}).`);
  }
  return data as T;
}

export function wireMessages(
  messages: { id: string; role: "user" | "assistant"; content: string }[],
) {
  return messages.slice(-40).map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
  }));
}
