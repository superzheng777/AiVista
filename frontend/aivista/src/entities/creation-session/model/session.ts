import type { AgentInputForm } from "./agent-input-form";

export type CreationStatus =
  "QUEUED" | "RUNNING" | "WAITING_INPUT" | "SUCCEEDED" | "PARTIALLY_SUCCEEDED" | "FAILED" | "CANCELLED";

export type SessionAsset = { assetId: string; url: string | null; expiresAt: string | null };

export type SessionItem =
  | { id: string; kind: "text"; assistantMessageId?: string; text: string; phase: "process" | "final" }
  | {
      id: string;
      kind: "tool";
      assistantMessageId?: string;
      toolCallId: string;
      name: string;
      skillName?: string;
      status: "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
    }
  | ({
      id: string;
      kind: "form";
      toolCallId: string;
      status: "PENDING" | "SUBMITTED" | "SKIPPED" | "CANCELLED";
    } & AgentInputForm)
  | { id: string; kind: "generation"; generationId: string | null; status: CreationStatus; assets: SessionAsset[] };

export type SessionFormItem = Extract<SessionItem, { kind: "form" }>;

export type CreationTurn = {
  stream?: { id: string; sequence: number };
  creationId: string;
  mode: "NORMAL" | "AGENT";
  status: CreationStatus;
  revision: number;
  input: { prompt: string; assets: SessionAsset[] };
  settings: { aspectRatio?: string; imageCount?: number; negativePrompt?: string; promptExtend?: boolean };
  items: SessionItem[];
  createdAt: string;
  completedAt: string | null;
  failureCode: string | null;
};

export type SessionSummary = { sessionId: string; title: string; creationCount: number; lastMessageAt: string };

export type SessionDetail = SessionSummary & { schemaVersion: 1; creationLimit: number; turns: CreationTurn[] };

export type CreatedCreation = { sessionId: string; turn: CreationTurn };

export type CreationEvent = (
  | { type: "creation.updated"; sessionId: string; creationId: string; status: CreationStatus; revision: number }
  | { type: "creation.item.upserted"; sessionId: string; creationId: string; item: SessionItem }
  | {
      type: "creation.text.delta";
      sessionId: string;
      creationId: string;
      itemId: string;
      assistantMessageId: string;
      delta: string;
      offset: number;
    }
  | { type: "creation.snapshot"; sessionId: string; creationId: string; turn: CreationTurn }
) & { streamId?: string; sequence?: number };

export function creationEventNeedsSync(session: SessionDetail | undefined, event: CreationEvent): boolean {
  if (!event.streamId || event.sequence === undefined || event.type === "creation.snapshot") return false;
  const turn = session?.turns.find((value) => value.creationId === event.creationId);
  if (!turn?.stream || turn.stream.id !== event.streamId) return true;
  if (event.type === "creation.text.delta" && event.sequence > turn.stream.sequence) {
    const item = turn.items.find((value) => value.id === event.itemId);
    if (event.offset > (item?.kind === "text" ? item.text.length : 0)) return true;
  }
  return event.sequence > turn.stream.sequence + 1;
}

export function isActiveCreation(status: CreationStatus): boolean {
  return status === "QUEUED" || status === "RUNNING" || status === "WAITING_INPUT";
}

export function applyCreationEvent(session: SessionDetail, event: CreationEvent): SessionDetail {
  if (session.sessionId !== event.sessionId) return session;
  return {
    ...session,
    turns: session.turns.map((turn) => {
      if (turn.creationId !== event.creationId) return turn;
      if (event.streamId && event.sequence !== undefined) {
        if (turn.stream?.id === event.streamId && event.sequence <= turn.stream.sequence) return turn;
        if (creationEventNeedsSync(session, event)) return turn;
      }
      if (event.type === "creation.snapshot")
        return {
          ...event.turn,
          ...(event.streamId && event.sequence !== undefined
            ? { stream: { id: event.streamId, sequence: event.sequence } }
            : {}),
        };
      const stream =
        event.streamId && event.sequence !== undefined ? { id: event.streamId, sequence: event.sequence } : turn.stream;
      if (event.type === "creation.text.delta") {
        const index = turn.items.findIndex((item) => item.id === event.itemId);
        const prior = turn.items[index];
        const text = prior?.kind === "text" ? prior.text : "";
        if (event.offset > text.length) return turn;
        const item: SessionItem = {
          id: event.itemId,
          kind: "text",
          assistantMessageId: event.assistantMessageId,
          phase: prior?.kind === "text" ? prior.phase : "process",
          text: text + event.delta.slice(Math.max(0, text.length - event.offset)),
        };
        return {
          ...turn,
          stream,
          items:
            index < 0
              ? [...turn.items, item]
              : turn.items.map((value, position) => (position === index ? item : value)),
        };
      }
      if (event.type === "creation.updated") {
        if (event.revision < turn.revision) return turn;
        return {
          ...turn,
          stream,
          status: event.status,
          revision: event.revision,
          items:
            event.status === "CANCELLED" || event.status === "FAILED"
              ? turn.items.map((item) => {
                  if (item.kind === "form" && item.status === "PENDING")
                    return { ...item, status: "CANCELLED" as const };
                  if (item.kind === "tool" && item.status === "RUNNING")
                    return { ...item, status: event.status as "CANCELLED" | "FAILED" };
                  return item;
                })
              : turn.items,
        };
      }
      const index = turn.items.findIndex((item) => item.id === event.item.id);
      return {
        ...turn,
        stream,
        items:
          index < 0
            ? [...turn.items, event.item]
            : turn.items.map((item, position) =>
                position === index ? (event.streamId ? event.item : mergeItem(item, event.item)) : item,
              ),
      };
    }),
  };
}

function mergeItem(current: SessionItem, incoming: SessionItem): SessionItem {
  if (current.kind === "text" && incoming.kind === "text")
    return {
      ...incoming,
      text: current.text.length > incoming.text.length ? current.text : incoming.text,
      phase: current.phase === "final" ? "final" : incoming.phase,
    };
  if (
    current.kind === "tool" &&
    incoming.kind === "tool" &&
    current.status !== "RUNNING" &&
    incoming.status === "RUNNING"
  )
    return current;
  if (
    current.kind === "form" &&
    incoming.kind === "form" &&
    current.status !== "PENDING" &&
    incoming.status === "PENDING"
  )
    return current;
  if (
    current.kind === "generation" &&
    incoming.kind === "generation" &&
    !isActiveCreation(current.status) &&
    isActiveCreation(incoming.status)
  )
    return current;
  return incoming;
}
