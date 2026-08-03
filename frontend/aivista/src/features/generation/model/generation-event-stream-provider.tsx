"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, use, useCallback, useEffect, useRef, useState } from "react";

import type { GenerationTask, GenerationTaskStatus } from "@/entities/generation/model/generation";
import { generationQueryKeys, getGenerationTask, listActiveGenerationTasks } from "@/features/generation/api/generation-api";
import { useAuthStore } from "@/features/auth/model/auth-store";

export type GenerationStreamStatus = "DISCONNECTED" | "CONNECTING" | "SYNCING" | "READY" | "RECONNECTING" | "FAILED";

type GenerationTaskUpdateEvent = {
  sessionId: string;
  taskId: string;
  taskVersion: number;
  status: GenerationTaskStatus;
  retryCount: number;
  maxRetryCount: number;
};

type GenerationEventStreamContextValue = {
  status: GenerationStreamStatus;
  reconnectAttempt: number;
  maxReconnectAttempts: number;
  ensureReady: () => Promise<boolean>;
};

const TASK_EVENT_NAME = "generation.task.updated";
const READY_EVENT_NAME = "generation.stream.ready";
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAYS_MS = [0, 1_000, 2_000] as const;

const GenerationEventStreamContext = createContext<GenerationEventStreamContextValue | null>(null);

function isTaskUpdateEvent(value: unknown): value is GenerationTaskUpdateEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<GenerationTaskUpdateEvent>;
  return typeof event.sessionId === "string"
    && typeof event.taskId === "string"
    && typeof event.taskVersion === "number"
    && typeof event.status === "string"
    && typeof event.retryCount === "number"
    && typeof event.maxRetryCount === "number";
}

function isTerminalStatus(status: GenerationTaskStatus): boolean {
  return status === "SUCCEEDED" || status === "PARTIALLY_SUCCEEDED"
    || status === "FAILED" || status === "CANCELLED";
}

function parseSseBlock(block: string): { eventName: string; data: string } | null {
  let eventName = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) eventName = line.slice("event:".length).trim();
    if (line.startsWith("data:")) data.push(line.slice("data:".length).trimStart());
  }
  return data.length ? { eventName, data: data.join("\n") } : null;
}

async function consumeSseStream(
  response: Response,
  onReady: () => void,
  onTaskUpdate: (event: GenerationTaskUpdateEvent) => void,
): Promise<void> {
  if (!response.body) throw new Error("The event stream has no response body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  while (true) {
    const { done, value } = await reader.read();
    pending = (pending + decoder.decode(value, { stream: !done })).replaceAll("\r\n", "\n");
    let boundary = pending.indexOf("\n\n");
    while (boundary !== -1) {
      const parsed = parseSseBlock(pending.slice(0, boundary));
      pending = pending.slice(boundary + 2);
      boundary = pending.indexOf("\n\n");
      if (!parsed) continue;
      if (parsed.eventName === READY_EVENT_NAME) {
        onReady();
        continue;
      }
      if (parsed.eventName !== TASK_EVENT_NAME) continue;
      try {
        const event: unknown = JSON.parse(parsed.data);
        if (isTaskUpdateEvent(event)) onTaskUpdate(event);
      } catch {
        // REST reconciliation after the next connection remains authoritative.
      }
    }
    if (done) return;
  }
}

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
  const readyRef = useRef(false);
  const everReadyRef = useRef(false);
  const lifecycleControllerRef = useRef<AbortController | null>(null);
  const streamControllerRef = useRef<AbortController | null>(null);
  const connectionSequenceRef = useRef(0);
  const batchRef = useRef<Promise<boolean> | null>(null);
  const startBatchRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
  const knownTaskIdsRef = useRef(new Set<string>());

  const mergeTaskSnapshot = useCallback((task: GenerationTask) => {
    queryClient.setQueryData<GenerationTask>(generationQueryKeys.task(task.id), (current) =>
      !current || task.version >= current.version ? task : current);
    if (isTerminalStatus(task.status)) {
      knownTaskIdsRef.current.delete(task.id);
    } else {
      knownTaskIdsRef.current.add(task.id);
    }
  }, [queryClient]);

  const applyTaskUpdate = useCallback((event: GenerationTaskUpdateEvent) => {
    knownTaskIdsRef.current.add(event.taskId);
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
        try {
          mergeTaskSnapshot(await getGenerationTask(event.taskId));
        } catch {
          // Keep the task ID for the next connection reconciliation.
        }
      }
    })();
  }, [mergeTaskSnapshot, queryClient]);

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
  }, [mergeTaskSnapshot, queryClient]);

  const startBatch = useCallback((): Promise<boolean> => {
    if (readyRef.current) return Promise.resolve(true);
    if (batchRef.current) return batchRef.current;

    const lifecycleController = lifecycleControllerRef.current;
    if (!lifecycleController || lifecycleController.signal.aborted) return Promise.resolve(false);

    const batch = (async () => {
      for (let index = 0; index < MAX_RECONNECT_ATTEMPTS; index += 1) {
        await wait(RECONNECT_DELAYS_MS[index], lifecycleController.signal);
        if (lifecycleController.signal.aborted || useAuthStore.getState().status !== "authenticated") return false;

        const attempt = index + 1;
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
          if (!response.ok) throw new Error(`Unable to open generation event stream: ${response.status}`);

          let serverReady = false;
          let connectionAccepted = false;
          const streamDone = consumeSseStream(response, () => { serverReady = true; }, applyTaskUpdate)
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
          const readyDeadline = window.setTimeout(() => streamController.abort(), 5_000);
          while (!serverReady && !streamController.signal.aborted) await wait(25, streamController.signal);
          window.clearTimeout(readyDeadline);
          if (!serverReady) throw new Error("Generation event stream did not become ready.");

          setStatus("SYNCING");
          await reconcile();
          if (streamController.signal.aborted || connectionSequenceRef.current !== sequence) {
            throw new Error("Generation event stream closed during reconciliation.");
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
      readyRef.current = false;
      setStatus("FAILED");
      return false;
    })().finally(() => {
      if (batchRef.current === batch) batchRef.current = null;
    });

    batchRef.current = batch;
    return batch;
  }, [applyTaskUpdate, reconcile]);

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
        if (activeTasks.length > 0) void startBatch();
      } catch {
        // This is only an activity probe; the first submission still calls ensureReady explicitly.
      }
    })();
    return () => {
      lifecycleController.abort();
      streamControllerRef.current?.abort();
      connectionSequenceRef.current += 1;
      readyRef.current = false;
    };
  }, [authStatus, mergeTaskSnapshot, startBatch]);

  return (
    <GenerationEventStreamContext value={{ status: authStatus === "authenticated" ? status : "DISCONNECTED",
      reconnectAttempt: authStatus === "authenticated" ? reconnectAttempt : 0,
      maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS, ensureReady: startBatch }}>
      {children}
    </GenerationEventStreamContext>
  );
}

export function useGenerationEventStream(): GenerationEventStreamContextValue {
  const value = use(GenerationEventStreamContext);
  if (!value) throw new Error("useGenerationEventStream must be used within GenerationEventStreamProvider.");
  return value;
}
