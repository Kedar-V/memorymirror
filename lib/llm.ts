import { Agent, CursorAgentError } from "@cursor/sdk";
import fs from "fs";
import os from "os";
import path from "path";

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function agentCwd() {
  const dir = path.join(os.tmpdir(), "memorymirror-agent");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function modelSettings() {
  return {
    model: process.env.CURSOR_MODEL || "composer-2.5",
    temperature: null as number | null,
  };
}

export function hasModelKey() {
  return Boolean(process.env.CURSOR_API_KEY);
}

export async function complete(messages: LlmMessage[]) {
  const key = process.env.CURSOR_API_KEY;
  if (!key) throw new Error("NO_KEY");
  const { model } = modelSettings();
  const prompt = [
    "Answer the conversation below.",
    "Return only the answer text.",
    "Do not use tools, edit files, or run commands.",
    "",
    ...messages.map((message) => `${message.role.toUpperCase()}:\n${message.content}`),
  ].join("\n\n");
  try {
    const result = await Agent.prompt(prompt, {
      apiKey: key,
      model: { id: model },
      local: {
        cwd: agentCwd(),
        settingSources: [],
        sandboxOptions: { enabled: true },
      },
    });
    if (result.status !== "finished" || !result.result?.trim()) {
      throw new Error(`MODEL_${result.status}`);
    }
    const resolved =
      result.model && typeof result.model === "object" && "id" in result.model
        ? String(result.model.id)
        : model;
    return { text: result.result.trim(), model: resolved };
  } catch (error) {
    if (error instanceof CursorAgentError) {
      throw new Error(`MODEL_${error.message.replace(/\s+/g, " ").slice(0, 180)}`);
    }
    throw error;
  }
}

export function publicError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code.startsWith("MODEL_")) return `The model request failed (${code.slice("MODEL_".length)}).`;
  return "The model request failed.";
}
