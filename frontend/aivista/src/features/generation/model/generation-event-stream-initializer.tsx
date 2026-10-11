"use client";

import { assetQueryKeys } from "@/features/assets/api/asset-api";
import { publicationQueryKeys } from "@/features/publication/api/publication-api";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { receiveCreationEvent, clearSessionEvents } from "./session-events";
import type { CreationEvent } from "@/entities/generation/model/session";
import { useAuthStore } from "@/features/auth/model/auth-store";
import { consumeSseStream, reconnectDelayMs } from "@/features/generation/model/generation-event-stream-parsing";

import { useGenerationEventStreamStore } from "./generation-event-stream-store";

const READY_TIMEOUT_MS = 5_000;
/** 提交路径等待实时连接就绪的上限，避免后端不可用时提交无限挂起。 */
const READY_WAIT_MS = 10_000;
const SYNC_POLL_MS = 25;

function wait(delay: number, signal: AbortSignal): Promise<void> {
  if (!delay || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const onAbort = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delay);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function GenerationEventStreamInitializer() {
  const queryClient = useQueryClient();
  const authStatus = useAuthStore((state) => state.status);
  const userId = useAuthStore((state) => state.user?.id);
  const lifecycleControllerRef = useRef<AbortController | null>(null);
  const streamControllerRef = useRef<AbortController | null>(null);
  const connectionSequenceRef = useRef(0);
  const batchRef = useRef<Promise<boolean> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startBatchRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
  const applyCreationUpdate = useCallback(
    (event: CreationEvent) => {
      if (!receiveCreationEvent(queryClient, event)) return;
      if (event.type === "creation.updated") {
        if (event.status === "SUCCEEDED" || event.status === "PARTIALLY_SUCCEEDED") {
          useGenerationEventStreamStore.setState((state) => ({
            completedSessionIds: new Set(state.completedSessionIds).add(event.sessionId),
          }));
        } else if (event.status === "FAILED") {
          useGenerationEventStreamStore.setState((state) => ({
            attentionSessionIds: new Set(state.attentionSessionIds).add(event.sessionId),
          }));
        }
      }
      if (event.type === "creation.item.upserted" && event.item.kind === "generation" && event.item.assets.length) {
        void queryClient.invalidateQueries({ queryKey: assetQueryKeys.all });
      }
    },
    [queryClient],
  );

  const applyPublicationUpdate = useCallback(() => {
    // The SSE event carries no unread count or message body; consumers refresh their own queries.
    useGenerationEventStreamStore.setState((state) => ({
      publicationRefreshVersion: state.publicationRefreshVersion + 1,
    }));
    void queryClient.invalidateQueries({ queryKey: assetQueryKeys.all });
    void queryClient.invalidateQueries({ queryKey: publicationQueryKeys.mine });
  }, [queryClient]);
  const startBatch = useCallback((): Promise<boolean> => {
    if (useAuthStore.getState().status !== "authenticated" || useAuthStore.getState().user?.id !== userId)
      return Promise.resolve(false);
    if (useGenerationEventStreamStore.getState().status === "READY") return Promise.resolve(true);
    if (batchRef.current) return batchRef.current;

    const lifecycleController = lifecycleControllerRef.current;
    if (!lifecycleController || lifecycleController.signal.aborted) return Promise.resolve(false);

    const batch = (async () => {
      for (let attempt = 1; ; attempt += 1) {
        await wait(reconnectDelayMs(attempt - 1), lifecycleController.signal);
        if (
          lifecycleController.signal.aborted ||
          useAuthStore.getState().status !== "authenticated" ||
          useAuthStore.getState().user?.id !== userId
        ) {
          return false;
        }

        useGenerationEventStreamStore.setState({
          reconnectAttempt: attempt,
          status: useGenerationEventStreamStore.getState().syncVersion > 0 ? "RECONNECTING" : "CONNECTING",
        });
        const streamController = new AbortController();
        streamControllerRef.current?.abort();
        streamControllerRef.current = streamController;
        const sequence = ++connectionSequenceRef.current;
        const isCurrent = () =>
          !lifecycleController.signal.aborted &&
          !streamController.signal.aborted &&
          connectionSequenceRef.current === sequence &&
          useAuthStore.getState().status === "authenticated" &&
          useAuthStore.getState().user?.id === userId;

        try {
          let token = useAuthStore.getState().accessToken;
          if (!token) token = await useAuthStore.getState().refreshAccessToken();
          if (!isCurrent()) return false;
          let response = await fetch("/api/events", {
            headers: { Authorization: `Bearer ${token}` },
            credentials: "include",
            signal: streamController.signal,
          });
          if (response.status === 401) {
            token = await useAuthStore.getState().refreshAccessToken();
            if (!isCurrent()) return false;
            response = await fetch("/api/events", {
              headers: { Authorization: `Bearer ${token}` },
              credentials: "include",
              signal: streamController.signal,
            });
          }
          if (!isCurrent()) {
            void response.body?.cancel();
            return false;
          }
          if (!response.ok) throw new Error(`Unable to open event stream: ${response.status}`);

          let serverReady = false;
          let connectionAccepted = false;
          const streamDone = consumeSseStream(
            response,
            () => {
              if (isCurrent()) serverReady = true;
            },
            (event) => {
              if (isCurrent()) applyCreationUpdate(event);
            },
            () => {
              if (isCurrent()) applyPublicationUpdate();
            },
            () => {
              if (isCurrent())
                useGenerationEventStreamStore.setState((state) => ({
                  notificationRefreshVersion: state.notificationRefreshVersion + 1,
                }));
            },
          )
            .catch(() => undefined)
            .finally(() => {
              if (connectionSequenceRef.current !== sequence || lifecycleController.signal.aborted) return;
              streamController.abort();
              if (connectionAccepted) {
                useGenerationEventStreamStore.setState({ status: "RECONNECTING" });
                reconnectTimerRef.current = setTimeout(() => {
                  if (!lifecycleController.signal.aborted) void startBatchRef.current();
                }, 0);
              }
            });
          const readyDeadline = window.setTimeout(() => streamController.abort(), READY_TIMEOUT_MS);
          while (!serverReady && !streamController.signal.aborted) await wait(SYNC_POLL_MS, streamController.signal);
          window.clearTimeout(readyDeadline);
          if (!serverReady) throw new Error("Event stream did not become ready.");

          if (streamController.signal.aborted || connectionSequenceRef.current !== sequence) {
            throw new Error("Event stream closed before becoming ready.");
          }
          connectionAccepted = true;
          useGenerationEventStreamStore.setState((state) => ({
            reconnectAttempt: 0,
            syncVersion: state.syncVersion + 1,
            status: "READY",
          }));
          void streamDone;
          return true;
        } catch {
          if (lifecycleController.signal.aborted) return false;
          streamController.abort();
        }
      }
    })().finally(() => {
      if (batchRef.current === batch) batchRef.current = null;
    });

    batchRef.current = batch;
    return batch;
  }, [applyPublicationUpdate, applyCreationUpdate, userId]);

  const ensureReady = useCallback(async (): Promise<boolean> => {
    const lifecycle = lifecycleControllerRef.current;
    if (!lifecycle || lifecycle.signal.aborted) return false;
    if (useGenerationEventStreamStore.getState().status === "READY") return true;
    let timer = 0;
    let onAbort = () => {};
    const timeout = new Promise<boolean>((resolve) => {
      onAbort = () => resolve(false);
      timer = window.setTimeout(onAbort, READY_WAIT_MS);
      lifecycle.signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      return await Promise.race([startBatch(), timeout]);
    } finally {
      window.clearTimeout(timer);
      lifecycle.signal.removeEventListener("abort", onAbort);
    }
  }, [startBatch]);

  const retryNow = useCallback(async (): Promise<boolean> => {
    if (useGenerationEventStreamStore.getState().status === "READY") return true;
    if (batchRef.current) return batchRef.current;
    useGenerationEventStreamStore.setState({ reconnectAttempt: 0, status: "DISCONNECTED" });
    return startBatch();
  }, [startBatch]);

  useEffect(() => {
    startBatchRef.current = startBatch;
  }, [startBatch]);

  useEffect(() => {
    useGenerationEventStreamStore.setState(useGenerationEventStreamStore.getInitialState(), true);
    clearSessionEvents(queryClient);
    if (authStatus !== "authenticated") return;

    const lifecycleController = new AbortController();
    lifecycleControllerRef.current = lifecycleController;
    useGenerationEventStreamStore.setState({ ensureReady, retryNow });
    void startBatch();
    return () => {
      lifecycleController.abort();
      streamControllerRef.current?.abort();
      if (reconnectTimerRef.current !== null) clearTimeout(reconnectTimerRef.current);
      lifecycleControllerRef.current = null;
      streamControllerRef.current = null;
      batchRef.current = null;
      connectionSequenceRef.current += 1;
      clearSessionEvents(queryClient);
      useGenerationEventStreamStore.setState(useGenerationEventStreamStore.getInitialState(), true);
    };
  }, [authStatus, userId, ensureReady, retryNow, startBatch, queryClient]);

  return null;
}
