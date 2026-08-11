"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, use, useCallback, useEffect, useRef, useState } from "react";

import type { GenerationTask } from "@/entities/generation/model/generation";import { generationQueryKeys, getGenerationTask, listActiveGenerationTasks } from "@/features/generation/api/generation-api";
import { useAuthStore } from "@/features/auth/model/auth-store";
import {
  consumeSseStream,
  isTerminalStatus,
  reconnectDelayMs,
  type GenerationSessionIndicator,
  type GenerationStreamStatus,
  type GenerationTaskUpdateEvent,
} from "@/features/generation/model/generation-event-stream-parsing";

export type { GenerationSessionIndicator } from "@/features/generation/model/generation-event-stream-parsing";

type GenerationEventStreamContextValue = {
  status: GenerationStreamStatus;
  reconnectAttempt: number;
  ensureReady: () => Promise<boolean>;
  retryNow: () => Promise<boolean>;
  activeTaskCount: number;
  sessionIndicators: Record<string, GenerationSessionIndicator>;
  hasCompletedResults: boolean;
  hasAttention: boolean;
  /** 发布相关的刷新信号：收到 publication.updated 或重连成功同步时自增。 */
  publicationRefreshVersion: number;
  notificationRefreshVersion: number;
  acknowledgeSession: (sessionId: string) => void;
  acknowledgeCompletedResults: () => void;
  registerSubmittedTask: (task: Pick<GenerationTask, "id" | "sessionId" | "status" | "version">) => void;
};

type TrackedTask = Pick<GenerationTask, "sessionId" | "status" | "version">;

const READY_TIMEOUT_MS = 5_000;
/** 提交路径等待实时连接就绪的上限，避免后端不可用时提交无限挂起。 */
const READY_WAIT_MS = 10_000;
const SYNC_POLL_MS = 25;

const GenerationEventStreamContext = createContext<GenerationEventStreamContextValue | null>(null);

function wait(delay: number, signal: AbortSignal): Promise<void> {
  if (!delay) return Promise.resolve();
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

export function GenerationEventStreamProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const authStatus = useAuthStore((state) => state.status);
  const [status, setStatus] = useState<GenerationStreamStatus>("DISCONNECTED");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [trackedTasks, setTrackedTasks] = useState<Record<string, TrackedTask>>({});
  const [completedSessionIds, setCompletedSessionIds] = useState<Set<string>>(() => new Set());
  const [attentionSessionIds, setAttentionSessionIds] = useState<Set<string>>(() => new Set());
  const [publicationRefreshVersion, setPublicationRefreshVersion] = useState(0);
  const [notificationRefreshVersion, setNotificationRefreshVersion] = useState(0);
  const readyRef = useRef(false);
  const everReadyRef = useRef(false);
  const lifecycleControllerRef = useRef<AbortController | null>(null);
  const streamControllerRef = useRef<AbortController | null>(null);
  const connectionSequenceRef = useRef(0);
  const batchRef = useRef<Promise<boolean> | null>(null);
  const inFlightRef = useRef(false);
  const startBatchRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
  const knownTaskIdsRef = useRef(new Set<string>());
  const taskVersionsRef = useRef(new Map<string, number>());

  const trackTask = useCallback((task: Pick<GenerationTask, "id" | "sessionId" | "status" | "version">) => {
    const knownVersion = taskVersionsRef.current.get(task.id);
    if (knownVersion !== undefined && task.version < knownVersion) return;
    taskVersionsRef.current.set(task.id, task.version);
    setTrackedTasks((current) => {
      const previous = current[task.id];
      if (previous && previous.version > task.version) return current;
      return { ...current, [task.id]: { sessionId: task.sessionId, status: task.status, version: task.version } };
    });
    if (task.status === "SUCCEEDED" || task.status === "PARTIALLY_SUCCEEDED") {
      setCompletedSessionIds((current) => current.has(task.sessionId) ? current : new Set(current).add(task.sessionId));
    }
    if (task.status === "FAILED" || task.status === "CANCELLED") {
      setAttentionSessionIds((current) => current.has(task.sessionId) ? current : new Set(current).add(task.sessionId));
    }
  }, []);

  const mergeTaskSnapshot = useCallback((task: GenerationTask) => {
    trackTask(task);
    queryClient.setQueryData<GenerationTask>(generationQueryKeys.task(task.id), (current) =>
      !current || task.version >= current.version ? task : current);
    if (isTerminalStatus(task.status)) {
      knownTaskIdsRef.current.delete(task.id);
    } else {
      knownTaskIdsRef.current.add(task.id);
    }
  }, [queryClient, trackTask]);

  const applyTaskUpdate = useCallback((event: GenerationTaskUpdateEvent) => {
    knownTaskIdsRef.current.add(event.taskId);
    trackTask({ id: event.taskId, sessionId: event.sessionId, status: event.status, version: event.taskVersion });
    const taskKey = generationQueryKeys.task(event.taskId);
    void (async () => {
      await queryClient.cancelQueries({ queryKey: taskKey });
      queryClient.setQueryData<GenerationTask>(taskKey, (current) => {
        if (!current || event.taskVersion < current.version) return current;
        return { ...current, status: event.status, version: event.taskVersion,
          retryCount: event.retryCount, maxRetryCount: event.maxRetryCount };
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: generationQueryKeys.sessions() }),
        queryClient.invalidateQueries({ queryKey: generationQueryKeys.messages(event.sessionId) }),
      ]);
      if (isTerminalStatus(event.status)) {
        if (event.status === "SUCCEEDED" || event.status === "PARTIALLY_SUCCEEDED") {
          await queryClient.invalidateQueries({ queryKey: ["assets"] });
        }
        try {
          mergeTaskSnapshot(await getGenerationTask(event.taskId));
        } catch {
          // Keep the task ID for the next connection reconciliation.
        }
      }
    })();
  }, [mergeTaskSnapshot, queryClient, trackTask]);

  const applyPublicationUpdate = useCallback(() => {
    // The SSE event carries no unread count or message body; consumers refresh their own queries.
    setPublicationRefreshVersion((current) => current + 1);
  }, []);

  const reconcile = useCallback(async () => {
    const taskIdsToReview = new Set(knownTaskIdsRef.current);
    const cachedTasks = queryClient.getQueriesData<GenerationTask>({
      queryKey: [...generationQueryKeys.all, "task"],
    });
    for (const [, task] of cachedTasks) {
      if (task && !isTerminalStatus(task.status)) taskIdsToReview.add(task.id);
    }

    const activeTasks = await listActiveGenerationTasks();
    for (const task of activeTasks) {
      taskIdsToReview.add(task.id);
      mergeTaskSnapshot(task);
    }

    const reviewedTasks = await Promise.all([...taskIdsToReview].map(getGenerationTask));
    for (const task of reviewedTasks) mergeTaskSnapshot(task);
    await queryClient.refetchQueries({ queryKey: generationQueryKeys.all, type: "active" });
    // REST reconciliation also corrects any interaction messages missed while offline.
    setPublicationRefreshVersion((current) => current + 1);
    setNotificationRefreshVersion((current) => current + 1);
  }, [mergeTaskSnapshot, queryClient]);

  const startBatch = useCallback((): Promise<boolean> => {
    if (readyRef.current) return Promise.resolve(true);
    if (batchRef.current) return batchRef.current;

    const lifecycleController = lifecycleControllerRef.current;
    if (!lifecycleController || lifecycleController.signal.aborted) return Promise.resolve(false);

    const batch = (async () => {
      inFlightRef.current = true;
      for (let attempt = 1; ; attempt += 1) {
        await wait(reconnectDelayMs(attempt - 1), lifecycleController.signal);
        if (lifecycleController.signal.aborted || useAuthStore.getState().status !== "authenticated") {
          return false;
        }

        setReconnectAttempt(attempt);
        setStatus(everReadyRef.current ? "RECONNECTING" : "CONNECTING");
        const streamController = new AbortController();
        streamControllerRef.current?.abort();
        streamControllerRef.current = streamController;
        const sequence = ++connectionSequenceRef.current;

        try {
          let token = useAuthStore.getState().accessToken;
          if (!token) token = await useAuthStore.getState().refreshAccessToken();
          let response = await fetch("/api/events", {
            headers: { Authorization: `Bearer ${token}` },
            credentials: "include",
            signal: streamController.signal,
          });
          if (response.status === 401) {
            token = await useAuthStore.getState().refreshAccessToken();
            response = await fetch("/api/events", {
              headers: { Authorization: `Bearer ${token}` },
              credentials: "include",
              signal: streamController.signal,
            });
          }
          if (!response.ok) throw new Error(`Unable to open event stream: ${response.status}`);

          let serverReady = false;
          let connectionAccepted = false;
          const streamDone = consumeSseStream(response, () => { serverReady = true; }, applyTaskUpdate, applyPublicationUpdate, () => setNotificationRefreshVersion((current) => current + 1))
            .catch(() => undefined)
            .finally(() => {
              if (connectionSequenceRef.current !== sequence || lifecycleController.signal.aborted) return;
              streamController.abort();
              readyRef.current = false;
              if (connectionAccepted) {
                setStatus("RECONNECTING");
                window.setTimeout(() => { void startBatchRef.current(); }, 0);
              }
            });
          const readyDeadline = window.setTimeout(() => streamController.abort(), READY_TIMEOUT_MS);
          while (!serverReady && !streamController.signal.aborted) await wait(SYNC_POLL_MS, streamController.signal);
          window.clearTimeout(readyDeadline);
          if (!serverReady) throw new Error("Event stream did not become ready.");

          setStatus("SYNCING");
          await reconcile();
          if (streamController.signal.aborted || connectionSequenceRef.current !== sequence) {
            throw new Error("Event stream closed during reconciliation.");
          }
          readyRef.current = true;
          everReadyRef.current = true;
          connectionAccepted = true;
          setReconnectAttempt(0);
          setStatus("READY");
          void streamDone;
          return true;
        } catch {
          if (lifecycleController.signal.aborted) return false;
          streamController.abort();
        }
      }
    })().finally(() => {
      if (batchRef.current === batch) batchRef.current = null;
      inFlightRef.current = false;
    });

    batchRef.current = batch;
    return batch;
  }, [applyPublicationUpdate, applyTaskUpdate, reconcile]);

  const ensureReady = useCallback(async (): Promise<boolean> => {
    if (readyRef.current) return true;
    const batch = startBatch();
    if (!batch) return false;
    let timer = 0;
    const timeout = new Promise<boolean>((resolve) => {
      timer = window.setTimeout(() => resolve(false), READY_WAIT_MS);
    });
    const result = await Promise.race([batch, timeout]);
    window.clearTimeout(timer);
    return result;
  }, [startBatch]);

  const retryNow = useCallback(async (): Promise<boolean> => {
    if (readyRef.current || inFlightRef.current) return batchRef.current ?? Promise.resolve(true);
    setReconnectAttempt(0);
    setStatus("DISCONNECTED");
    return startBatch();
  }, [startBatch]);

  useEffect(() => {
    startBatchRef.current = startBatch;
  }, [startBatch]);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      lifecycleControllerRef.current?.abort();
      streamControllerRef.current?.abort();
      lifecycleControllerRef.current = null;
      readyRef.current = false;
      everReadyRef.current = false;
      knownTaskIdsRef.current.clear();
      taskVersionsRef.current.clear();
      queueMicrotask(() => {
        setTrackedTasks({});
        setCompletedSessionIds(new Set());
        setAttentionSessionIds(new Set());
      });
      return;
    }

    const lifecycleController = new AbortController();
    lifecycleControllerRef.current = lifecycleController;
    queueMicrotask(() => {
      if (lifecycleController.signal.aborted) return;
      setReconnectAttempt(0);
      setStatus("DISCONNECTED");
    });
    void (async () => {
      try {
        const activeTasks = await listActiveGenerationTasks();
        if (lifecycleController.signal.aborted) return;
        for (const task of activeTasks) mergeTaskSnapshot(task);
        void startBatch();
      } catch {
        // A failed probe must not prevent the connection attempt from starting.
      }
    })();
    return () => {
      lifecycleController.abort();
      streamControllerRef.current?.abort();
      connectionSequenceRef.current += 1;
      readyRef.current = false;
    };
  }, [authStatus, mergeTaskSnapshot, startBatch]);

  const activeTaskCount = Object.values(trackedTasks)
    .filter((task) => task.status === "QUEUED" || task.status === "RUNNING").length;
  const sessionIndicators = Object.values(trackedTasks).reduce<Record<string, GenerationSessionIndicator>>((indicators, task) => {
    if (task.status === "QUEUED" || task.status === "RUNNING") {
      indicators[task.sessionId] = "ACTIVE";
    }
    return indicators;
  }, {});
  for (const sessionId of completedSessionIds) {
    if (!sessionIndicators[sessionId]) sessionIndicators[sessionId] = "COMPLETED";
  }
  for (const sessionId of attentionSessionIds) {
    if (!sessionIndicators[sessionId]) sessionIndicators[sessionId] = "ATTENTION";
  }

  const acknowledgeSession = useCallback((sessionId: string) => {
    setCompletedSessionIds((current) => {
      if (!current.has(sessionId)) return current;
      const next = new Set(current);
      next.delete(sessionId);
      return next;
    });
    setAttentionSessionIds((current) => {
      if (!current.has(sessionId)) return current;
      const next = new Set(current);
      next.delete(sessionId);
      return next;
    });
  }, []);

  const acknowledgeCompletedResults = useCallback(() => setCompletedSessionIds(new Set()), []);

  const registerSubmittedTask = useCallback((task: Pick<GenerationTask, "id" | "sessionId" | "status" | "version">) => {
    trackTask(task);
  }, [trackTask]);

  return (
    <GenerationEventStreamContext value={{ status: authStatus === "authenticated" ? status : "DISCONNECTED",
      reconnectAttempt: authStatus === "authenticated" ? reconnectAttempt : 0,
      ensureReady, retryNow, activeTaskCount, sessionIndicators,
      hasCompletedResults: completedSessionIds.size > 0, hasAttention: attentionSessionIds.size > 0,
      publicationRefreshVersion, notificationRefreshVersion, acknowledgeSession, acknowledgeCompletedResults, registerSubmittedTask }}>
      {children}
    </GenerationEventStreamContext>
  );
}

export function useGenerationEventStream(): GenerationEventStreamContextValue {
  const value = use(GenerationEventStreamContext);
  if (!value) throw new Error("useGenerationEventStream must be used within GenerationEventStreamProvider.");
  return value;
}
