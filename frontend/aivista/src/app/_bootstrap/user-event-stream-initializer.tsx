"use client";

import { isActiveCreation, type CreationEvent, type SessionDetail } from "@/entities/creation-session/model/session";
import { useUserEventStreamStore } from "@/entities/user-event-stream/model/user-event-stream-store";
import { assetQueryKeys } from "@/features/assets/api/asset-api";
import { useAuthStore } from "@/features/auth/model/auth-store";
import { generationQueryKeys } from "@/features/generation/api/generation-api";
import { clearSessionEvents, isSessionDeleted, receiveCreationEvent } from "@/features/generation/model/session-events";
import { notificationQueryKeys } from "@/features/notifications/api/notification-api";
import { publicationQueryKeys } from "@/features/publication/api/publication-api";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

/** A tab owns one socket; HTTP mutations never wait for the event channel. */
export function UserEventStreamInitializer() {
  const queryClient = useQueryClient();
  const authStatus = useAuthStore((state) => state.status);
  const userId = useAuthStore((state) => state.user?.id);
  useEffect(() => {
    const store = useUserEventStreamStore;
    store.setState(store.getInitialState(), true);
    clearSessionEvents(queryClient);
    if (authStatus !== "authenticated" || !userId) return;
    let disposed = false;
    let socket: WebSocket | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let lastSeen = Date.now();
    let connecting = false;
    const syncing = new Set<string>();
    const isCurrent = () =>
      !disposed && useAuthStore.getState().status === "authenticated" && useAuthStore.getState().user?.id === userId;
    const syncCreations = (ids: string[]) => {
      if (socket?.readyState !== WebSocket.OPEN || store.getState().status !== "READY") return;
      const wanted = [...new Set(ids)].filter((id) => !syncing.has(id)).slice(0, 30);
      if (!wanted.length) return;
      wanted.forEach((id) => syncing.add(id));
      socket.send(JSON.stringify({ type: "sync", creationIds: wanted }));
    };
    const schedule = () => {
      if (!isCurrent() || timer) return;
      const delay = Math.min(15_000, 1000 * 2 ** Math.min(attempt++, 4)) + Math.floor(Math.random() * 250);
      store.setState({ status: "RECONNECTING", reconnectAttempt: attempt });
      timer = setTimeout(() => {
        timer = undefined;
        void connect();
      }, delay);
    };
    const connect = async () => {
      if (!isCurrent() || connecting || (socket && socket.readyState < WebSocket.CLOSING)) return;
      connecting = true;
      store.setState({ status: store.getState().syncVersion ? "RECONNECTING" : "CONNECTING" });
      try {
        let token = useAuthStore.getState().accessToken;
        if (!token) token = await useAuthStore.getState().refreshAccessToken();
        if (!isCurrent()) return;
        const endpoint = new URL("/api/ws/events", window.location.href);
        endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
        const current = new WebSocket(endpoint);
        socket = current;
        lastSeen = Date.now();
        deadline = setTimeout(() => {
          if (store.getState().status !== "READY") current.close();
        }, 5_000);
        current.onopen = () => {
          if (isCurrent() && socket === current)
            current.send(JSON.stringify({ type: "authenticate", accessToken: token }));
        };
        current.onmessage = (message) => {
          if (!isCurrent() || socket !== current) return;
          try {
            const event = JSON.parse(String(message.data));
            lastSeen = Date.now();
            if (event.type === "ping") {
              current.send(JSON.stringify({ type: "pong" }));
              return;
            }
            if (event.type === "user.ready") {
              clearTimeout(deadline);
              attempt = 0;
              syncing.clear();
              store.setState((state) => ({ status: "READY", reconnectAttempt: 0, syncVersion: state.syncVersion + 1 }));
              const ids: string[] = [];
              for (const query of queryClient.getQueryCache().getAll()) {
                const data = query.state.data as SessionDetail | undefined;
                if (data?.schemaVersion === 1 && Array.isArray(data.turns))
                  for (const turn of data.turns)
                    if (
                      isActiveCreation(turn.status) ||
                      turn.items.some((item) => item.kind === "generation" && isActiveCreation(item.status))
                    )
                      ids.push(turn.creationId);
              }
              syncCreations(ids);
              void queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount });
              void queryClient.invalidateQueries({ queryKey: generationQueryKeys.sessions() });
              void queryClient.invalidateQueries({ queryKey: assetQueryKeys.all });
              void queryClient.invalidateQueries({ queryKey: publicationQueryKeys.mine });
              store.setState((state) => ({
                publicationRefreshVersion: state.publicationRefreshVersion + 1,
                notificationRefreshVersion: state.notificationRefreshVersion + 1,
              }));
              return;
            }
            if (event.type === "publication.updated") {
              store.setState((state) => ({ publicationRefreshVersion: state.publicationRefreshVersion + 1 }));
              void queryClient.invalidateQueries({ queryKey: assetQueryKeys.all });
              void queryClient.invalidateQueries({ queryKey: publicationQueryKeys.mine });
              return;
            }
            if (event.type === "interaction.notification.created") {
              store.setState((state) => ({ notificationRefreshVersion: state.notificationRefreshVersion + 1 }));
              return;
            }
            if (!validCreationEvent(event)) return;
            if (event.type === "creation.snapshot") syncing.delete(event.creationId);
            if (!receiveCreationEvent(queryClient, event)) {
              if (!isSessionDeleted(queryClient, event.sessionId)) syncCreations([event.creationId]);
              return;
            }
            const status =
              event.type === "creation.updated"
                ? event.status
                : event.type === "creation.snapshot"
                  ? event.turn.status
                  : undefined;
            if (status === "SUCCEEDED" || status === "PARTIALLY_SUCCEEDED")
              store.setState((state) => ({
                completedSessionIds: new Set(state.completedSessionIds).add(event.sessionId),
              }));
            else if (status === "FAILED")
              store.setState((state) => ({
                attentionSessionIds: new Set(state.attentionSessionIds).add(event.sessionId),
              }));
            if (
              (event.type === "creation.item.upserted" &&
                event.item.kind === "generation" &&
                event.item.assets.length) ||
              status === "SUCCEEDED" ||
              status === "PARTIALLY_SUCCEEDED"
            )
              void queryClient.invalidateQueries({ queryKey: assetQueryKeys.all });
          } catch {
            current.close(1008, "Invalid event");
          }
        };
        current.onerror = () => current.close();
        current.onclose = async (event) => {
          if (!isCurrent() || socket !== current) return;
          clearTimeout(deadline);
          socket = undefined;
          syncing.clear();
          store.setState({ status: "RECONNECTING" });
          if (event.code === 4001) {
            try {
              await useAuthStore.getState().refreshAccessToken();
            } catch {
              schedule();
              return;
            }
          }
          schedule();
        };
      } catch {
        schedule();
      } finally {
        connecting = false;
      }
    };
    store.setState({
      syncCreations,
      retryNow: () => {
        clearTimeout(timer);
        timer = undefined;
        attempt = 0;
        if (socket) {
          const previous = socket;
          socket = undefined;
          previous.close();
        }
        void connect();
      },
    });
    const heartbeat = setInterval(() => {
      if (socket && Date.now() - lastSeen > 45_000) socket.close();
    }, 15_000);
    void connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearTimeout(deadline);
      clearInterval(heartbeat);
      socket?.close();
      clearSessionEvents(queryClient);
      store.setState(store.getInitialState(), true);
    };
  }, [authStatus, userId, queryClient]);
  return null;
}

function validCreationEvent(event: Record<string, unknown>): event is CreationEvent {
  if (
    typeof event.sessionId !== "string" ||
    typeof event.creationId !== "string" ||
    typeof event.streamId !== "string" ||
    !Number.isSafeInteger(event.sequence)
  )
    return false;
  if (event.type === "creation.updated")
    return typeof event.status === "string" && Number.isSafeInteger(event.revision);
  if (event.type === "creation.text.delta")
    return (
      typeof event.itemId === "string" &&
      typeof event.assistantMessageId === "string" &&
      typeof event.delta === "string" &&
      Number.isSafeInteger(event.offset)
    );
  if (event.type === "creation.snapshot")
    return !!event.turn && typeof event.turn === "object" && "items" in event.turn;
  if (event.type === "creation.item.upserted")
    return !!event.item && typeof event.item === "object" && "id" in event.item;
  return false;
}
