"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getPersona, personas, promptFromMemories } from "./demo-personas";
import {
  memorySchema,
  messageSchema,
  relationshipSchema,
  type ChatMessage,
  type Memory,
  type PromptMemory,
  type Relationship,
} from "./schemas";
import type { ProfileStatement } from "./profile";

export type Mode = "workspace" | "lab" | "eval";
export type Pane = "chat" | "graph" | "inspector";
export type Theme = "light" | "dark";
export type Destination = "start" | "workspace";

export type ProfileSnap = { at: string; statements: ProfileStatement[] };

export type Session = {
  messages: ChatMessage[];
  memories: Memory[];
  relationships: Relationship[];
  profileHistory: ProfileSnap[];
};

type Store = {
  hydrated: boolean;
  theme: Theme;
  mode: Mode;
  pane: Pane;
  destination: Destination;
  personaId: string;
  messages: ChatMessage[];
  memories: Memory[];
  relationships: Relationship[];
  profileHistory: ProfileSnap[];
  sessions: Record<string, Session>;
  selectedMemoryId: string | null;
  fixtureMode: boolean | null;
  personalize: boolean;
  setHydrated: (value: boolean) => void;
  setTheme: (theme: Theme) => void;
  setMode: (mode: Mode) => void;
  setPane: (pane: Pane) => void;
  setFixtureMode: (value: boolean) => void;
  setDestination: (destination: Destination) => void;
  setPersonalize: (personalize: boolean) => void;
  selectMemory: (id: string | null) => void;
  loadPersona: (id: string) => void;
  removeRelationship: (id: string) => void;
  rememberProfile: (snap: ProfileSnap) => void;
  tagReply: (messageId: string, memoryIds: string[]) => void;
  reset: () => void;
  addMessage: (message: ChatMessage) => void;
  addMemories: (incoming: Memory[]) => void;
  approve: (id: string) => void;
  correct: (id: string, claim: string) => void;
  deleteMemory: (id: string) => void;
  restore: (id: string) => void;
  adoptClaim: (id: string) => void;
  installSession: (id: string, session: Session) => void;
  deleteConversation: (conversationId: string) => void;
  deleteBatch: (batchId: string) => void;
  deleteDerived: (batchId: string) => void;
  clearArchive: () => void;
  dirty: () => boolean;
};

const seed = getPersona("demo");

function asTheme(value: unknown): Theme {
  return value === "dark" ? "dark" : "light";
}

function asMode(value: unknown): Mode {
  return value === "lab" || value === "eval" ? value : "workspace";
}

function asPane(value: unknown): Pane {
  return value === "graph" || value === "inspector" ? value : "chat";
}

function asDestination(value: unknown): Destination {
  return value === "workspace" ? "workspace" : "start";
}

function freshSession(id: string): Session {
  const persona = getPersona(id);
  return {
    messages: structuredClone(persona.messages),
    memories: structuredClone(persona.memories),
    relationships: structuredClone(persona.links),
    profileHistory: [],
  };
}

function keepSession(state: {
  personaId: string;
  messages: ChatMessage[];
  memories: Memory[];
  relationships: Relationship[];
  profileHistory: ProfileSnap[];
  sessions: Record<string, Session>;
}, patch: Partial<Session> & { personaId?: string; selectedMemoryId?: string | null }) {
  const personaId = patch.personaId ?? state.personaId;
  const session: Session = {
    messages: patch.messages ?? state.messages,
    memories: patch.memories ?? state.memories,
    relationships: patch.relationships ?? state.relationships,
    profileHistory: patch.profileHistory ?? state.profileHistory,
  };
  return {
    ...patch,
    personaId,
    messages: session.messages,
    memories: session.memories,
    relationships: session.relationships,
    profileHistory: session.profileHistory,
    sessions: { ...state.sessions, [personaId]: session },
  };
}

export function versionChain(memories: Memory[], id: string) {
  const byId = new Map(memories.map((memory) => [memory.id, memory]));
  let current = byId.get(id);
  if (!current) return [];
  const seen = new Set<string>();
  while (current.supersedesId && byId.has(current.supersedesId) && !seen.has(current.id)) {
    seen.add(current.id);
    current = byId.get(current.supersedesId)!;
  }
  const chain: Memory[] = [];
  while (current && !chain.some((memory) => memory.id === current!.id)) {
    chain.push(current);
    if (!current.supersededById || !byId.has(current.supersededById)) break;
    current = byId.get(current.supersededById);
  }
  return chain;
}

export function activePrompt(memories: Memory[]): PromptMemory[] {
  return promptFromMemories(memories);
}

export const useMemoryStore = create<Store>()(
  persist(
    (set, get) => ({
      hydrated: false,
      theme: "light",
      mode: "workspace",
      pane: "chat",
      destination: "start",
      personaId: seed.id,
      messages: structuredClone(seed.messages),
      memories: structuredClone(seed.memories),
      relationships: structuredClone(seed.links),
      profileHistory: [],
      sessions: { [seed.id]: freshSession(seed.id) },
      selectedMemoryId: null,
      fixtureMode: null,
      personalize: true,
      setHydrated: (hydrated) => set({ hydrated }),
      setTheme: (theme) => set({ theme }),
      setMode: (mode) => set({ mode }),
      setPane: (pane) => set({ pane }),
      setDestination: (destination) => set({ destination }),
      setPersonalize: (personalize) => set({ personalize }),
      setFixtureMode: (fixtureMode) => set({ fixtureMode }),
      selectMemory: (selectedMemoryId) => set({ selectedMemoryId }),
      loadPersona: (id) => {
        const persona = personas.find((item) => item.id === id);
        if (!persona) return;
        const current = get();
        const next = current.sessions[id] ?? freshSession(id);
        set({
          ...keepSession(
            { ...current, sessions: { ...current.sessions, [current.personaId]: {
              messages: current.messages,
              memories: current.memories,
              relationships: current.relationships,
              profileHistory: current.profileHistory,
            } } },
            { personaId: id, ...next, selectedMemoryId: null },
          ),
        });
      },
      reset: () => {
        const id = get().personaId;
        const next = freshSession(id);
        set((state) => keepSession(state, { ...next, selectedMemoryId: null }));
      },
      removeRelationship: (id) =>
        set((state) =>
          keepSession(state, {
            relationships: state.relationships.map((item) =>
              item.id === id ? { ...item, status: "removed" } : item,
            ),
          }),
        ),
      rememberProfile: (snap) =>
        set((state) => {
          const last = state.profileHistory[state.profileHistory.length - 1];
          const same = JSON.stringify(last?.statements ?? []) === JSON.stringify(snap.statements);
          if (same) return state;
          return keepSession(state, { profileHistory: [...state.profileHistory, snap].slice(-12) });
        }),
      tagReply: (messageId, memoryIds) =>
        set((state) =>
          keepSession(state, {
            messages: state.messages.map((message) =>
              message.id === messageId ? { ...message, usedMemoryIds: memoryIds } : message,
            ),
          }),
        ),
      addMessage: (message) =>
        set((state) => keepSession(state, { messages: [...state.messages, message].slice(-240) })),
      addMemories: (incoming) =>
        set((state) => {
          if (state.memories.length >= 80) return state;
          const existing = new Set(
            state.memories
              .filter((memory) => memory.status === "approved" || memory.status === "candidate")
              .map((memory) => memory.claim.toLowerCase()),
          );
          const fresh = incoming.filter((memory) => {
            const parsed = memorySchema.safeParse(memory);
            return parsed.success && !existing.has(parsed.data.claim.toLowerCase());
          });
          if (!fresh.length) return state;
          return keepSession(state, { memories: [...state.memories, ...fresh].slice(0, 80) });
        }),
      approve: (id) =>
        set((state) =>
          keepSession(state, {
            memories: state.memories.map((memory) =>
              memory.id === id && memory.status === "candidate"
                ? { ...memory, status: "approved" }
                : memory,
            ),
          }),
        ),
      correct: (id, claim) => {
        const trimmed = claim.trim();
        if (!trimmed || trimmed.length > 500) return;
        set((state) => {
          const old = state.memories.find((memory) => memory.id === id);
          if (!old || (old.status !== "approved" && old.status !== "candidate")) return state;
          if (old.claim === trimmed) return state;
          const nextId = crypto.randomUUID();
          const next: Memory = {
            ...old,
            id: nextId,
            claim: trimmed,
            kind: "explicit",
            status: "approved",
            version: old.version + 1,
            supersedesId: old.id,
            supersededById: null,
            priorStatus: null,
            modelReportedConfidence: null,
            createdAt: new Date().toISOString(),
          };
          return keepSession(state, {
            selectedMemoryId: nextId,
            memories: state.memories
              .map((memory) =>
                memory.id === id
                  ? { ...memory, status: "superseded" as const, supersededById: nextId }
                  : memory,
              )
              .concat(next),
          });
        });
      },
      deleteMemory: (id) =>
        set((state) =>
          keepSession(state, {
            memories: state.memories.map((memory) =>
              memory.id === id && memory.status !== "deleted"
                ? { ...memory, priorStatus: memory.status, status: "deleted" }
                : memory,
            ),
          }),
        ),
      restore: (id) =>
        set((state) =>
          keepSession(state, {
            memories: state.memories.map((memory) =>
              memory.id === id && memory.status === "deleted" && memory.priorStatus
                ? { ...memory, status: memory.priorStatus, priorStatus: null }
                : memory,
            ),
          }),
        ),
      adoptClaim: (id) => {
        const state = get();
        const chosen = state.memories.find((memory) => memory.id === id);
        const chain = versionChain(state.memories, id);
        const head = chain[chain.length - 1];
        if (!chosen || !head || head.id === chosen.id) return;
        get().correct(head.id, chosen.claim);
      },
      installSession: (id, session) => {
        if (!personas.some((persona) => persona.id === id)) return;
        const messages = messageSchema.array().safeParse(session.messages.slice(0, 200));
        const memories = memorySchema.array().safeParse(session.memories.slice(0, 200));
        const relationships = relationshipSchema.array().safeParse(session.relationships.slice(0, 200));
        if (!messages.success || !memories.success || !relationships.success) return;
        const next: Session = {
          messages: messages.data,
          memories: memories.data,
          relationships: relationships.data,
          profileHistory: [],
        };
        const current = get();
        set({
          ...keepSession(
            {
              ...current,
              sessions: {
                ...current.sessions,
                [current.personaId]: {
                  messages: current.messages,
                  memories: current.memories,
                  relationships: current.relationships,
                  profileHistory: current.profileHistory,
                },
              },
            },
            { personaId: id, ...next, selectedMemoryId: null },
          ),
          destination: "workspace",
        });
      },
      deleteConversation: (conversationId) =>
        set((state) =>
          keepSession(state, {
            messages: state.messages.filter((message) => message.conversationId !== conversationId),
          }),
        ),
      deleteBatch: (batchId) =>
        set((state) =>
          keepSession(state, {
            messages: state.messages.filter((message) => message.importBatchId !== batchId),
          }),
        ),
      deleteDerived: (batchId) =>
        set((state) => {
          const ids = new Set(state.messages.filter((message) => message.importBatchId === batchId).map((message) => message.id));
          return keepSession(state, {
            memories: state.memories.map((memory) =>
              memory.status !== "deleted" && memory.sourceMessageIds.some((id) => ids.has(id))
                ? { ...memory, priorStatus: memory.status, status: "deleted" as const }
                : memory,
            ),
          });
        }),
      clearArchive: () =>
        set((state) => {
          const sessions: Record<string, Session> = {};
          for (const persona of personas) sessions[persona.id] = freshSession(persona.id);
          const next = sessions[state.personaId] ?? freshSession("maya");
          return keepSession({ ...state, sessions }, { ...next, selectedMemoryId: null });
        }),
      dirty: () => {
        const state = get();
        const persona = getPersona(state.personaId);
        const pack = (messages: ChatMessage[], memories: Memory[]) =>
          JSON.stringify({
            messages: messages.map((message) => [
              message.id,
              message.role,
              message.content,
              Boolean(message.simulated),
            ]),
            memories: memories.map((memory) => [
              memory.id,
              memory.claim,
              memory.kind,
              memory.status,
              memory.version,
              memory.supersedesId,
              memory.evidence.join("|"),
              memory.sourceMessageIds.join("|"),
            ]),
          });
        return pack(state.messages, state.memories) !== pack(persona.messages, persona.memories);
      },
    }),
    {
      name: "memorymirror",
      version: 3,
      partialize: (state) => ({
        theme: state.theme,
        mode: state.mode,
        pane: state.pane,
        destination: state.destination,
        personaId: state.personaId,
        messages: state.messages,
        memories: state.memories,
        relationships: state.relationships,
        profileHistory: state.profileHistory,
        sessions: state.sessions,
        selectedMemoryId: state.selectedMemoryId,
        personalize: state.personalize,
      }),
      migrate: (persisted, version) => {
        const saved = (persisted ?? {}) as Partial<Store>;
        if (version >= 3 && saved.sessions) return saved as Store;
        const personaId = personas.some((persona) => persona.id === saved.personaId) ? (saved.personaId as string) : seed.id;
        const sessions = Object.fromEntries(personas.map((persona) => [persona.id, freshSession(persona.id)]));
        const active = sessions[personaId] ?? freshSession(personaId);
        return {
          ...saved,
          destination: asDestination(saved.destination),
          personalize: true,
          personaId,
          ...active,
          sessions,
          selectedMemoryId: null,
        } as Store;
      },
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<Store>;
        const personaId = personas.some((persona) => persona.id === saved.personaId)
          ? (saved.personaId as string)
          : current.personaId;
        const persona = getPersona(personaId);
        const messages = messageSchema.array().safeParse(saved.messages);
        const memories = memorySchema.array().safeParse(saved.memories);
        const relationships = relationshipSchema.array().safeParse(saved.relationships);
        const active: Session = {
          messages: messages.success ? messages.data : structuredClone(persona.messages),
          memories: memories.success ? memories.data : structuredClone(persona.memories),
          relationships: relationships.success ? relationships.data : [],
          profileHistory: Array.isArray(saved.profileHistory) ? saved.profileHistory : [],
        };
        const sessions = saved.sessions && typeof saved.sessions === "object" ? { ...saved.sessions } : {};
        sessions[personaId] = active;
        return {
          ...current,
          theme: asTheme(saved.theme),
          mode: asMode(saved.mode),
          pane: asPane(saved.pane),
          destination: asDestination(saved.destination),
          personalize: saved.personalize !== false,
          personaId,
          ...active,
          sessions,
          selectedMemoryId:
            typeof saved.selectedMemoryId === "string" || saved.selectedMemoryId === null
              ? saved.selectedMemoryId ?? null
              : null,
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
