import type { AgentInputForm } from "./generation";

export type CreationStatus =
  "QUEUED" | "RUNNING" | "WAITING_INPUT" | "SUCCEEDED" | "PARTIALLY_SUCCEEDED" | "FAILED" | "CANCELLED";
export type SessionAsset = { assetId: string; url: string | null; expiresAt: string | null };
export type SessionItem =
  | { id: string; kind: "text"; text: string; phase: "process" | "final" }
  | {
      id: string;
      kind: "tool";
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
export type CreationEvent =
  | { type: "creation.updated"; sessionId: string; creationId: string; status: CreationStatus; revision: number }
  | { type: "creation.item.upserted"; sessionId: string; creationId: string; item: SessionItem };

export function isActiveCreation(status: CreationStatus): boolean {
  return status === "QUEUED" || status === "RUNNING" || status === "WAITING_INPUT";
}

export function applyCreationEvent(session: SessionDetail, event: CreationEvent): SessionDetail {
  if (session.sessionId !== event.sessionId) return session;
  return {
    ...session,
    turns: session.turns.map((turn) => {
      if (turn.creationId !== event.creationId) return turn;
      if (event.type === "creation.updated") {
        if (event.revision < turn.revision) return turn;
        return {
          ...turn,
          status: event.status,
          revision: event.revision,
          items:
            event.status === "CANCELLED" || event.status === "FAILED"
              ? turn.items.map((item) => {
                  if (item.kind === "form" && item.status === "PENDING")
                    return { ...item, status: "CANCELLED" as const };
                  if ((item.kind === "tool" || item.kind === "generation") && item.status === "RUNNING")
                    return { ...item, status: event.status as "CANCELLED" | "FAILED" };
                  return item;
                })
              : turn.items,
        };
      }
      const index = turn.items.findIndex((item) => item.id === event.item.id);
      return {
        ...turn,
        items:
          index < 0
            ? [...turn.items, event.item]
            : turn.items.map((item, position) => (position === index ? mergeItem(item, event.item) : item)),
      };
    }),
  };
}

/** A late HTTP snapshot must not replace newer text or a terminal state already received over SSE. */
export function mergeSessionSnapshot(current: SessionDetail | undefined, incoming: SessionDetail): SessionDetail {
  if (!current || current.sessionId !== incoming.sessionId) return incoming;
  const turns = incoming.turns.map((turn) => {
    const prior = current.turns.find((value) => value.creationId === turn.creationId);
    if (!prior) return turn;
    const items = turn.items.map((item) => {
      const previous = prior.items.find((value) => value.id === item.id);
      return previous ? mergeItem(previous, item) : item;
    });
    for (const item of prior.items) if (!items.some((value) => value.id === item.id)) items.push(item);
    return {
      ...turn,
      ...(prior.revision > turn.revision ? { status: prior.status, revision: prior.revision } : {}),
      items,
    };
  });
  for (const turn of current.turns) if (!turns.some((value) => value.creationId === turn.creationId)) turns.push(turn);
  return { ...incoming, creationCount: Math.max(incoming.creationCount, turns.length), turns };
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
