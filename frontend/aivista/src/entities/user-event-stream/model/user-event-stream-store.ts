"use client";

import { create } from "zustand";
import type { SessionIndicator, UserEventStreamStatus } from "./user-event-stream-types";

type UserEventStreamState = {
  status: UserEventStreamStatus;
  reconnectAttempt: number;
  completedSessionIds: Set<string>;
  attentionSessionIds: Set<string>;
  syncVersion: number;
  publicationRefreshVersion: number;
  notificationRefreshVersion: number;
  syncCreations: (ids: string[]) => void;
  retryNow: () => void;
  acknowledgeSession: (sessionId: string) => void;
  acknowledgeCompletedResults: () => void;
};

// Connection actions are installed only while the authenticated initializer is mounted.
export const useUserEventStreamStore = create<UserEventStreamState>((set) => ({
  status: "DISCONNECTED",
  reconnectAttempt: 0,
  completedSessionIds: new Set(),
  attentionSessionIds: new Set(),
  syncVersion: 0,
  publicationRefreshVersion: 0,
  notificationRefreshVersion: 0,
  syncCreations: () => {},
  retryNow: () => {},
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

export function selectSessionIndicators(state: UserEventStreamState) {
  const indicators: Record<string, SessionIndicator> = {};
  for (const id of state.completedSessionIds) indicators[id] = "COMPLETED";
  for (const id of state.attentionSessionIds) indicators[id] = "ATTENTION";
  return indicators;
}
