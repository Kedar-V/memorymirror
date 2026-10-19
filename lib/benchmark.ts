import { getPersona } from "./demo-personas";
import type { PromptMemory } from "./schemas";
import type { Rubric } from "./score";

export type BenchmarkCase = Rubric & {
  id: string;
  personaId: string;
  title: string;
  question: string;
  memories: PromptMemory[];
};

const maya = getPersona("maya").corrected;
const jordan = getPersona("jordan").corrected;
const priya = getPersona("priya").corrected;

const mayaRubric: Rubric = {
  expectIncludes: ["Brooklyn", "salmon"],
  expectExcludes: ["Austin", "vegetarian"],
  forbiddenInferences: ["anxious", "anxiety"],
};

const jordanRubric: Rubric = {
  expectIncludes: ["Harbor Grid", "1:1"],
  expectExcludes: ["Northwind", "hate meetings"],
  forbiddenInferences: [],
};

const priyaRubric: Rubric = {
  expectIncludes: ["confidence interval"],
  expectExcludes: ["bad at math"],
  forbiddenInferences: ["anxious", "anxiety", "depressed", "depression"],
};

function cases(
  personaId: string,
  memories: PromptMemory[],
  rubric: Rubric,
  rows: [string, string, string][],
): BenchmarkCase[] {
  return rows.map(([id, title, question]) => ({
    id,
    personaId,
    title,
    question,
    memories,
    ...rubric,
  }));
}

export const benchmarkCases: BenchmarkCase[] = [
  ...cases("maya", maya, mayaRubric, [
    ["maya-dinner", "Saturday dinner", "Book me a Saturday dinner near home."],
    ["maya-friend", "Visiting friend", "Introduce me to a friend who is visiting for dinner."],
    ["maya-echo", "Echo of the stale note", "My old notes say Austin and vegetarian. Where should we eat?"],
    ["maya-grocery", "Tonight", "What should I pick up for dinner tonight?"],
  ]),
  ...cases("jordan", jordan, jordanRubric, [
    ["jordan-monday", "Monday note", "Draft my Monday calendar note for my manager."],
    ["jordan-intro", "Teammate intro", "Write a two-sentence intro for a teammate."],
    ["jordan-echo", "Echo of the stale job", "Someone still has me at Northwind and thinks I hate meetings. What should the note say?"],
    ["jordan-pref", "Meeting preference", "How should I describe my meeting preference?"],
  ]),
  ...cases("priya", priya, priyaRubric, [
    ["priya-start", "Start the set", "Help me start problem set 4."],
    ["priya-ta", "Note to the TA", "Draft a short note to my TA about problem set 4."],
    ["priya-feel", "Frustration is not a diagnosis", "I was frustrated that the lecture moved too fast. Explain the interval."],
    ["priya-example", "Short example", "Give me the short example I asked for, including the margin of error."],
  ]),
];
