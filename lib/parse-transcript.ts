import { messageSchema, type ChatMessage } from "./schemas";

export const IMPORT_MESSAGE_CAP = 200;

export type ParsedConversation = {
  id: string;
  title: string | null;
  messages: ChatMessage[];
  branchIds: string[];
};

export type ParseResult = {
  format: "chatgpt" | "json" | "text" | "csv";
  conversations: ParsedConversation[];
  skipped: number;
};

const SPEAKER = /^(user|assistant|human|chatgpt|ai)\s*:\s*(.*)$/i;

function clip(value: string, max: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function uniqueId(used: Set<string>, raw: string) {
  const base = clip(raw.replace(/[^\w:-]/g, ""), 80) || "m";
  let next = base;
  let n = 2;
  while (used.has(next)) {
    const suffix = `-${n}`;
    next = `${base.slice(0, 80 - suffix.length)}${suffix}`;
    n += 1;
  }
  used.add(next);
  return next;
}

function stamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? "" : new Date(parsed).toISOString();
}

function roleOf(value: string): ChatMessage["role"] | null {
  const text = value.toLowerCase();
  if (text === "user" || text === "human") return "user";
  if (text === "assistant" || text === "chatgpt" || text === "ai") return "assistant";
  return null;
}

function pushMessage(
  used: Set<string>,
  batchId: string,
  conversationId: string,
  title: string | null,
  sourceRef: string,
  raw: { id?: string; role: string; content: string; createdAt?: string },
  skipped: { n: number },
) {
  const role = roleOf(raw.role);
  const content = raw.content.trim().slice(0, 4000);
  if (!role || !content) {
    skipped.n += 1;
    return null;
  }
  const parsed = messageSchema.safeParse({
    id: uniqueId(used, raw.id || `${conversationId}-${used.size + 1}`),
    role,
    content,
    createdAt: raw.createdAt ?? "",
    conversationId,
    title: title || undefined,
    sourceRef,
    importBatchId: batchId,
  });
  if (!parsed.success) {
    skipped.n += 1;
    return null;
  }
  return parsed.data;
}

function textOf(message: { content?: { content_type?: string; parts?: unknown[] } } | null | undefined) {
  const content = message?.content;
  if (!content) return "";
  if (content.content_type && content.content_type !== "text" && content.content_type !== "multimodal_text") return "";
  if (!Array.isArray(content.parts)) return "";
  return content.parts.filter((part): part is string => typeof part === "string").join("\n").trim();
}

function chatgpt(data: unknown[], batchId: string): ParseResult {
  const used = new Set<string>();
  const skipped = { n: 0 };
  const conversations: ParsedConversation[] = [];
  data.forEach((item, index) => {
    if (!item || typeof item !== "object" || !("mapping" in item)) {
      skipped.n += 1;
      return;
    }
    const row = item as {
      id?: string;
      title?: string;
      current_node?: string;
      mapping?: Record<string, { id?: string; parent?: string | null; children?: string[]; message?: { id?: string; author?: { role?: string }; content?: { content_type?: string; parts?: unknown[] }; create_time?: number | null } }>;
    };
    const mapping = row.mapping ?? {};
    const ids = Object.keys(mapping);
    let cursor = row.current_node && mapping[row.current_node] ? row.current_node : "";
    if (!cursor) {
      const leaves = ids.filter((id) => !(mapping[id]?.children ?? []).length);
      cursor = leaves.sort((a, b) => (mapping[b]?.message?.create_time ?? 0) - (mapping[a]?.message?.create_time ?? 0))[0] ?? "";
    }
    const path: string[] = [];
    const seen = new Set<string>();
    while (cursor && mapping[cursor] && !seen.has(cursor)) {
      seen.add(cursor);
      path.push(cursor);
      cursor = mapping[cursor]?.parent ?? "";
    }
    path.reverse();
    const conversationId = uniqueId(used, String(row.id || `chatgpt-${index + 1}`));
    const title = typeof row.title === "string" && row.title.trim() ? clip(row.title, 120) : null;
    const messages: ChatMessage[] = [];
    for (const nodeId of path) {
      const node = mapping[nodeId];
      const message = node?.message;
      const role = message?.author?.role ?? "";
      if (role === "system" || role === "tool") continue;
      const built = pushMessage(used, batchId, conversationId, title, `chatgpt:${conversationId}`, {
        id: message?.id || nodeId,
        role,
        content: textOf(message),
        createdAt: stamp(message?.create_time),
      }, skipped);
      if (built) messages.push(built);
    }
    if (!messages.length) {
      skipped.n += 1;
      return;
    }
    conversations.push({
      id: conversationId,
      title,
      messages,
      branchIds: ids.filter((id) => !seen.has(id)),
    });
  });
  return { format: "chatgpt", conversations, skipped: skipped.n };
}

function fromMessages(rows: unknown[], batchId: string, conversationId: string, title: string | null, sourceRef: string, used: Set<string>, skipped: { n: number }) {
  const messages: ChatMessage[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      skipped.n += 1;
      continue;
    }
    const item = row as { id?: unknown; role?: unknown; content?: unknown; message?: unknown; text?: unknown; createdAt?: unknown; timestamp?: unknown };
    const built = pushMessage(used, batchId, conversationId, title, sourceRef, {
      id: typeof item.id === "string" ? item.id : undefined,
      role: typeof item.role === "string" ? item.role : "",
      content: typeof item.content === "string" ? item.content : typeof item.message === "string" ? item.message : typeof item.text === "string" ? item.text : "",
      createdAt: stamp(item.createdAt ?? item.timestamp),
    }, skipped);
    if (built) messages.push(built);
  }
  return messages;
}

function jsonConversations(data: unknown, batchId: string): ParseResult | null {
  const used = new Set<string>();
  const skipped = { n: 0 };
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { conversations?: unknown }).conversations)
      ? (data as { conversations: unknown[] }).conversations
      : data && typeof data === "object" && Array.isArray((data as { messages?: unknown }).messages)
        ? [data]
        : null;
  if (!list) return null;
  if (list.some((item) => item && typeof item === "object" && "mapping" in item)) return chatgpt(list, batchId);
  const conversations: ParsedConversation[] = [];
  list.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      skipped.n += 1;
      return;
    }
    const row = item as { id?: unknown; title?: unknown; messages?: unknown; role?: unknown; content?: unknown };
    if (typeof row.role === "string" && (typeof row.content === "string" || typeof (row as { message?: unknown }).message === "string")) {
      return;
    }
    const messages = Array.isArray(row.messages) ? row.messages : [];
    const conversationId = uniqueId(used, typeof row.id === "string" ? row.id : `json-${index + 1}`);
    const title = typeof row.title === "string" && row.title.trim() ? clip(row.title, 120) : null;
    const built = fromMessages(messages, batchId, conversationId, title, `json:${conversationId}`, used, skipped);
    if (built.length) conversations.push({ id: conversationId, title, messages: built, branchIds: [] });
    else skipped.n += 1;
  });
  if (!conversations.length && Array.isArray(data)) {
    const built = fromMessages(data, batchId, uniqueId(used, "json-1"), null, "json:messages", used, skipped);
    if (built.length) conversations.push({ id: built[0]?.conversationId || "json-1", title: null, messages: built, branchIds: [] });
  }
  return { format: "json", conversations, skipped: skipped.n };
}

function parseCsv(text: string, batchId: string): ParseResult {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted && char === '"' && text[i + 1] === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') quoted = !quoted;
    else if (!quoted && char === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((part) => part.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some((part) => part.trim())) rows.push(row);
  }
  const header = (rows[0] ?? []).map((part) => part.trim().toLowerCase());
  const messageAt = header.findIndex((part) => part === "message" || part === "content" || part === "text");
  const roleAt = header.findIndex((part) => part === "role" || part === "speaker");
  const timeAt = header.findIndex((part) => part === "timestamp" || part === "createdat" || part === "time" || part === "date");
  const used = new Set<string>();
  const skipped = { n: 0 };
  if (messageAt < 0 || roleAt < 0) return { format: "csv", conversations: [], skipped: rows.length };
  const conversationId = uniqueId(used, "csv-1");
  const messages = fromMessages(
    rows.slice(1).map((parts) => ({
      role: parts[roleAt] ?? "",
      content: parts[messageAt] ?? "",
      timestamp: timeAt >= 0 ? parts[timeAt] ?? "" : "",
    })),
    batchId,
    conversationId,
    null,
    "csv:csv-1",
    used,
    skipped,
  );
  return {
    format: "csv",
    conversations: messages.length ? [{ id: conversationId, title: null, messages, branchIds: [] }] : [],
    skipped: skipped.n,
  };
}

function parseText(text: string, batchId: string): ParseResult {
  const used = new Set<string>();
  const skipped = { n: 0 };
  const conversationId = uniqueId(used, "text-1");
  const blocks: { role: string; content: string }[] = [];
  let role = "";
  let lines: string[] = [];
  function flush() {
    if (!role) return;
    blocks.push({ role, content: lines.join("\n").trim() });
    lines = [];
  }
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(SPEAKER);
    if (!match) {
      if (role) lines.push(line);
      else if (line.trim()) skipped.n += 1;
      continue;
    }
    flush();
    role = match[1];
    lines = [match[2]];
  }
  flush();
  const messages = fromMessages(blocks, batchId, conversationId, null, "text:text-1", used, skipped);
  return {
    format: "text",
    conversations: messages.length ? [{ id: conversationId, title: null, messages, branchIds: [] }] : [],
    skipped: skipped.n,
  };
}

export function parseTranscript(text: string, filename: string, batchId: string): ParseResult {
  const name = filename.toLowerCase();
  const trimmed = text.trim();
  if (name.endsWith(".csv") || /^role\s*,|^(message|content)\s*,/i.test(trimmed.split(/\r?\n/)[0] ?? "")) {
    return parseCsv(text, batchId);
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const data = JSON.parse(trimmed) as unknown;
      const parsed = jsonConversations(data, batchId);
      if (parsed && (parsed.conversations.length || parsed.format === "chatgpt")) return parsed;
    } catch {
      return { format: "json", conversations: [], skipped: 1 };
    }
  }
  return parseText(text, batchId);
}

export function selectedMessages(conversations: ParsedConversation[], picked: string[]) {
  const chosen = new Set(picked);
  return conversations.filter((item) => chosen.has(item.id)).flatMap((item) => item.messages).slice(0, IMPORT_MESSAGE_CAP);
}

export function dateSpan(messages: ChatMessage[]) {
  const times = messages.map((message) => Date.parse(message.createdAt)).filter((value) => !Number.isNaN(value));
  if (!times.length) return "Date unknown";
  const start = new Date(Math.min(...times)).toISOString().slice(0, 10);
  const end = new Date(Math.max(...times)).toISOString().slice(0, 10);
  return start === end ? start : `${start} – ${end}`;
}
