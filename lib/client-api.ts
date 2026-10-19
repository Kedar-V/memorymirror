export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
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
