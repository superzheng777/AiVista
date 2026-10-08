import type { QueryClient } from "@tanstack/react-query";
import { applyCreationEvent, mergeSessionSnapshot, type CreatedCreation, type CreationEvent,
  type SessionDetail } from "@/entities/generation/model/session";
import { generationQueryKeys } from "../api/generation-api";

const pending = new WeakMap<QueryClient, Map<string, Map<string, CreationEvent>>>();
export function receiveCreationEvent(client: QueryClient, event: CreationEvent): void {
  const key = generationQueryKeys.session(event.sessionId);
  const current = client.getQueryData<SessionDetail>(key);
  if (current?.turns.some((turn) => turn.creationId === event.creationId)) {
    client.setQueryData(key, applyCreationEvent(current, event)); return;
  }
  let sessions = pending.get(client);
  if (!sessions) { sessions = new Map(); pending.set(client, sessions); }
  let events = sessions.get(event.sessionId);
  if (!events) { events = new Map(); sessions.set(event.sessionId, events); }
  events.set(`${event.creationId}:${event.type === "creation.updated" ? "status" : event.item.id}`, event);
}
export function hydrateSession(client: QueryClient, snapshot: SessionDetail): SessionDetail {
  let result = mergeSessionSnapshot(client.getQueryData(generationQueryKeys.session(snapshot.sessionId)), snapshot);
  const sessions = pending.get(client);
  for (const event of sessions?.get(snapshot.sessionId)?.values() ?? []) result = applyCreationEvent(result, event);
  sessions?.delete(snapshot.sessionId);
  return result;
}
export function insertCreatedTurn(client: QueryClient, result: CreatedCreation): void {
  const key = generationQueryKeys.session(result.sessionId);
  const current = client.getQueryData<SessionDetail>(key);
  const snapshot: SessionDetail = current ? { ...current,
    turns: [...current.turns.filter((turn) => turn.creationId !== result.turn.creationId), result.turn],
    creationCount: current.creationCount + (current.turns.some((turn) => turn.creationId === result.turn.creationId) ? 0 : 1),
  } : { schemaVersion: 1, sessionId: result.sessionId, title: result.turn.input.prompt.slice(0, 40),
    creationCount: 1, creationLimit: 30, lastMessageAt: result.turn.createdAt, turns: [result.turn] };
  client.setQueryData(key, hydrateSession(client, snapshot));
}
export function clearSessionEvents(client: QueryClient): void { pending.delete(client); }
