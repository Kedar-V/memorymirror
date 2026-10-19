import { categoryOf } from "./present";
import type { Memory } from "./schemas";

export type ProfileCategory =
  | "Background"
  | "Interests"
  | "Dislikes"
  | "Communication"
  | "Goals"
  | "Habits"
  | "Needs a look";

export type ProfileStatement = {
  id: string;
  userId: string;
  text: string;
  category: ProfileCategory;
  memoryIds: string[];
  kind: Memory["kind"];
  status: Memory["status"];
  at: string;
  revision: number;
};

const ORDER: ProfileCategory[] = [
  "Background",
  "Interests",
  "Dislikes",
  "Communication",
  "Goals",
  "Habits",
  "Needs a look",
];

export function profileCategory(memory: Memory): ProfileCategory {
  if (memory.status === "candidate" || memory.kind === "inference") return "Needs a look";
  const bucket = categoryOf(memory.claim);
  if (/\b(hate|hates|dislike|don't want|do not want)\b/i.test(memory.claim)) return "Dislikes";
  if (/\b(want|goal|priority)\b/i.test(memory.claim)) return "Goals";
  if (bucket === "Work" || bucket === "Education" || bucket === "Experiences") return "Background";
  if (bucket === "Preferences") return "Interests";
  if (/\b(meeting|1:1|explain|language)\b/i.test(memory.claim)) return "Communication";
  return "Habits";
}

export function buildProfile(userId: string, memories: Memory[]) {
  const active = memories.filter((memory) => memory.status === "approved" || memory.status === "candidate");
  const statements: ProfileStatement[] = active.map((memory) => ({
    id: `pf-${memory.id}`.slice(0, 80),
    userId,
    text: memory.claim,
    category: profileCategory(memory),
    memoryIds: [memory.id],
    kind: memory.kind,
    status: memory.status,
    at: memory.createdAt,
    revision: memory.version,
  }));
  const updatedAt = statements.reduce((latest, statement) => (statement.at > latest ? statement.at : latest), "");
  return { userId, updatedAt, statements, order: ORDER };
}

export function profileIsClean(userId: string, memories: Memory[]) {
  const { statements } = buildProfile(userId, memories);
  const ids = new Set(memories.map((memory) => memory.id));
  return statements.every(
    (statement) =>
      statement.userId === userId &&
      statement.memoryIds.every((id) => ids.has(id)) &&
      statement.memoryIds.every((id) => memories.find((memory) => memory.id === id)?.status !== "deleted"),
  );
}
