import {
  applyCreationEvent,
  creationEventNeedsSync,
  type CreatedCreation,
  type CreationEvent,
  type SessionDetail,
} from "@/entities/creation-session/model/session";
import type { QueryClient } from "@tanstack/react-query";
import { generationQueryKeys } from "../api/generation-api";

const deleted = new WeakMap<QueryClient, Set<string>>();
const requests = new WeakMap<QueryClient, Map<string, Set<CreationEvent[]>>>();

export function isSessionDeleted(client: QueryClient, sessionId: string): boolean {
  return deleted.get(client)?.has(sessionId) ?? false;
}

export function forgetSessionEvents(client: QueryClient, sessionId: string): void {
  let sessions = deleted.get(client);
  if (!sessions) {
    sessions = new Set();
    deleted.set(client, sessions);
  }
  sessions.add(sessionId);
}

export function receiveCreationEvent(client: QueryClient, event: CreationEvent): boolean {
  if (isSessionDeleted(client, event.sessionId)) return false;
  for (const buffer of requests.get(client)?.get(event.sessionId) ?? []) buffer.push(event);
  const key = generationQueryKeys.session(event.sessionId);
  const current = client.getQueryData<SessionDetail>(key);
  const next = sessionWithEvent(current, event);
  if (!next) return false;
  client.setQueryData(key, next);
  return true;
}

function sessionWithEvent(current: SessionDetail | undefined, event: CreationEvent): SessionDetail | undefined {
  if (event.type === "creation.snapshot") {
    const base = current ?? {
      schemaVersion: 1 as const,
      sessionId: event.sessionId,
      title: event.turn.input.prompt.slice(0, 40),
      creationCount: 1,
      creationLimit: 30,
      lastMessageAt: event.turn.createdAt,
      turns: [],
    };
    const existing = base.turns.some((turn) => turn.creationId === event.creationId);
    const state = existing
      ? base
      : {
          ...base,
          creationCount: Math.max(base.creationCount, base.turns.length + 1),
          turns: [...base.turns, { ...event.turn, stream: undefined }],
        };
    return applyCreationEvent(state, event);
  }
  if (creationEventNeedsSync(current, event)) return undefined;
  if (current?.turns.some((turn) => turn.creationId === event.creationId)) {
    return applyCreationEvent(current, event);
  }
  return undefined;
}

/** Keep events only for the duration of this HTTP request; the server cursor excludes overlap. */
export async function loadSessionSnapshot(
  client: QueryClient,
  sessionId: string,
  load: () => Promise<SessionDetail>,
): Promise<SessionDetail> {
  let sessions = requests.get(client);
  if (!sessions) {
    sessions = new Map();
    requests.set(client, sessions);
  }
  let buffers = sessions.get(sessionId);
  if (!buffers) {
    buffers = new Set();
    sessions.set(sessionId, buffers);
  }
  const events: CreationEvent[] = [];
  buffers.add(events);
  try {
    let result = await load();
    for (const event of events) result = sessionWithEvent(result, event) ?? result;
    return result;
  } finally {
    buffers.delete(events);
    if (!buffers.size) sessions.delete(sessionId);
  }
}

export function insertCreatedTurn(client: QueryClient, result: CreatedCreation): void {
  const key = generationQueryKeys.session(result.sessionId);
  const current = client.getQueryData<SessionDetail>(key);
  const snapshot: SessionDetail = current
    ? {
        ...current,
        // A WS snapshot may arrive before the creation POST response.
        turns: current.turns.some((turn) => turn.creationId === result.turn.creationId)
          ? current.turns
          : [...current.turns, result.turn],
        creationCount:
          current.creationCount + (current.turns.some((turn) => turn.creationId === result.turn.creationId) ? 0 : 1),
      }
    : {
        schemaVersion: 1,
        sessionId: result.sessionId,
        title: result.turn.input.prompt.slice(0, 40),
        creationCount: 1,
        creationLimit: 30,
        lastMessageAt: result.turn.createdAt,
        turns: [result.turn],
      };
  client.setQueryData(key, snapshot);
}

export function clearSessionEvents(client: QueryClient): void {
  deleted.delete(client);
  requests.delete(client);
}
