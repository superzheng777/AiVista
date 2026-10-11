"use client";

import { create } from "zustand";
import type { GenerationSessionIndicator, GenerationStreamStatus } from "./generation-event-stream-parsing";

type GenerationEventStreamState = {
  status: GenerationStreamStatus;
  reconnectAttempt: number;
  completedSessionIds: Set<string>;
  attentionSessionIds: Set<string>;
  syncVersion: number;
  publicationRefreshVersion: number;
  notificationRefreshVersion: number;
  ensureReady: () => Promise<boolean>;
  retryNow: () => Promise<boolean>;
  acknowledgeSession: (sessionId: string) => void;
  acknowledgeCompletedResults: () => void;
};

// Connection actions are installed only while the authenticated initializer is mounted.
const unavailable = async () => false;
export const useGenerationEventStreamStore = create<GenerationEventStreamState>((set) => ({
  status: "DISCONNECTED",
  reconnectAttempt: 0,
  completedSessionIds: new Set(),
  attentionSessionIds: new Set(),
  syncVersion: 0,
  publicationRefreshVersion: 0,
  notificationRefreshVersion: 0,
  ensureReady: unavailable,
  retryNow: unavailable,
  acknowledgeSession: (sessionId) =>
    set((state) => {
      if (!state.completedSessionIds.has(sessionId) && !state.attentionSessionIds.has(sessionId)) return state;
      const completedSessionIds = new Set(state.completedSessionIds);
      const attentionSessionIds = new Set(state.attentionSessionIds);
      completedSessionIds.delete(sessionId);
      attentionSessionIds.delete(sessionId);
      return { completedSessionIds, attentionSessionIds };
    }),
  acknowledgeCompletedResults: () =>
    set((state) => (state.completedSessionIds.size ? { completedSessionIds: new Set() } : state)),
}));

export function selectSessionIndicators(state: GenerationEventStreamState) {
  const indicators: Record<string, GenerationSessionIndicator> = {};
  for (const id of state.completedSessionIds) indicators[id] = "COMPLETED";
  for (const id of state.attentionSessionIds) indicators[id] = "ATTENTION";
  return indicators;
}
