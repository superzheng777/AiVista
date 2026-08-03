"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { GenerationTask } from "@/entities/generation/model/generation";
import { generationQueryKeys } from "@/features/generation/api/generation-api";
import { useAuthStore } from "@/features/auth/model/auth-store";

type GenerationTaskUpdateEvent = {
  sessionId: string;
  taskId: string;
  taskVersion: number;
  status: string;
};

type UseGenerationEventStreamOptions = {
  enabled: boolean;
  sessionId: string | null;
  taskId: string | null;
};

const EVENT_NAME = "generation.task.updated";
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

function isTaskUpdateEvent(value: unknown): value is GenerationTaskUpdateEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const event = value as Partial<GenerationTaskUpdateEvent>;
  return typeof event.sessionId === "string"
    && typeof event.taskId === "string"
    && typeof event.taskVersion === "number"
    && typeof event.status === "string";
}

function parseSseBlock(block: string): { eventName: string; data: string } | null {
  let eventName = "message";
  const data: string[] = [];

  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
    }
    if (line.startsWith("data:")) {
      data.push(line.slice("data:".length).trimStart());
    }
  }

  return data.length ? { eventName, data: data.join("\n") } : null;
}

async function consumeSseStream(
  response: Response,
  onTaskUpdate: (event: GenerationTaskUpdateEvent) => void,
): Promise<void> {
  if (!response.body) {
    throw new Error("The event stream has no response body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  while (true) {
    const { done, value } = await reader.read();
    pending += decoder.decode(value, { stream: !done }).replaceAll("\r\n", "\n");

    let boundary = pending.indexOf("\n\n");
    while (boundary !== -1) {
      const parsed = parseSseBlock(pending.slice(0, boundary));
      pending = pending.slice(boundary + 2);
      boundary = pending.indexOf("\n\n");

      if (!parsed || parsed.eventName !== EVENT_NAME) {
        continue;
      }

      try {
        const event: unknown = JSON.parse(parsed.data);
        if (isTaskUpdateEvent(event)) {
          onTaskUpdate(event);
        }
      } catch {
        // A malformed notification is non-authoritative; the next reconnect rechecks REST state.
      }
    }

    if (done) {
      return;
    }
  }
}

function waitForReconnect(delay: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(resolve, delay);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
}

/**
 * SSE only announces that a task may have changed. REST queries remain the source of truth.
 */
export function useGenerationEventStream({ enabled, sessionId, taskId }: UseGenerationEventStreamOptions): void {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshAccessToken = useAuthStore((state) => state.refreshAccessToken);
  const latestVersionByTask = useRef(new Map<string, number>());

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();

    const refreshVisibleData = async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: generationQueryKeys.sessions() }),
        sessionId
          ? queryClient.invalidateQueries({ queryKey: generationQueryKeys.messages(sessionId) })
          : Promise.resolve(),
        taskId
          ? queryClient.invalidateQueries({ queryKey: generationQueryKeys.task(taskId) })
          : Promise.resolve(),
      ]);
    };

    const applyTaskUpdate = (event: GenerationTaskUpdateEvent) => {
      const cachedTask = queryClient.getQueryData<GenerationTask>(generationQueryKeys.task(event.taskId));
      const knownVersion = Math.max(latestVersionByTask.current.get(event.taskId) ?? 0, cachedTask?.version ?? 0);
      if (event.taskVersion <= knownVersion) {
        return;
      }

      latestVersionByTask.current.set(event.taskId, event.taskVersion);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: generationQueryKeys.sessions() }),
        queryClient.invalidateQueries({ queryKey: generationQueryKeys.messages(event.sessionId) }),
        queryClient.invalidateQueries({ queryKey: generationQueryKeys.task(event.taskId) }),
      ]);
    };

    const connect = async () => {
      let token = accessToken;
      let reconnectDelay = INITIAL_RECONNECT_DELAY_MS;

      if (!token) {
        try {
          token = await refreshAccessToken();
        } catch {
          return;
        }
      }

      while (!controller.signal.aborted) {
        try {
          await refreshVisibleData();
          const response = await fetch("/api/events", {
            headers: { Authorization: `Bearer ${token}` },
            credentials: "include",
            signal: controller.signal,
          });

          if (response.status === 401) {
            token = await refreshAccessToken();
            reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
            continue;
          }

          if (!response.ok) {
            throw new Error(`Unable to open generation event stream: ${response.status}`);
          }

          await consumeSseStream(response, applyTaskUpdate);
          reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
        } catch {
          if (controller.signal.aborted) {
            return;
          }
        }

        await waitForReconnect(reconnectDelay, controller.signal);
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
      }
    };

    void connect();
    return () => controller.abort();
  }, [accessToken, enabled, queryClient, refreshAccessToken, sessionId, taskId]);
}
