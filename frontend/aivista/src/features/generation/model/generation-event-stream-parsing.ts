import type { GenerationTaskStatus, PublicationReviewStatus } from "@/entities/generation/model/generation";

export type GenerationStreamStatus = "DISCONNECTED" | "CONNECTING" | "SYNCING" | "READY" | "RECONNECTING";

export type GenerationTaskUpdateEvent = {
  sessionId: string;
  taskId: string;
  taskVersion: number;
  status: GenerationTaskStatus;
  retryCount: number;
  maxRetryCount: number;
};

export type PublicationStatusUpdateEvent = {
  imageId: string;
  publicationVersion: number;
  status: PublicationReviewStatus;
  publicAt: string | null;
};

export type GenerationSessionIndicator = "ACTIVE" | "COMPLETED" | "ATTENTION";

export const TASK_EVENT_NAME = "generation.task.updated";
export const PUBLICATION_EVENT_NAME = "publication.updated";
export const READY_EVENT_NAME = "generation.stream.ready";
export const INTERACTION_NOTIFICATION_EVENT_NAME = "interaction.notification.created";
export const MAX_RECONNECT_DELAY_MS = 3_000;

/** 发布终态：只有这些状态才允许驱动“信号 → 全量重拉”。 */
export const PUBLICATION_TERMINAL_STATUSES: ReadonlySet<string> = new Set(["APPROVED", "REJECTED", "FAILED"]);

export function isTaskUpdateEvent(value: unknown): value is GenerationTaskUpdateEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<GenerationTaskUpdateEvent>;
  return typeof event.sessionId === "string"
    && typeof event.taskId === "string"
    && typeof event.taskVersion === "number"
    && typeof event.status === "string"
    && typeof event.retryCount === "number"
    && typeof event.maxRetryCount === "number";
}

export function isPublicationStatusUpdateEvent(value: unknown): value is PublicationStatusUpdateEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<PublicationStatusUpdateEvent>;
  if (typeof event.imageId !== "string") return false;
  if (typeof event.publicationVersion !== "number" || !Number.isSafeInteger(event.publicationVersion)) return false;
  if (typeof event.status !== "string" || !PUBLICATION_TERMINAL_STATUSES.has(event.status)) return false;
  return event.publicAt === null || typeof event.publicAt === "string";
}

export function isTerminalStatus(status: GenerationTaskStatus): boolean {
  return status === "SUCCEEDED" || status === "PARTIALLY_SUCCEEDED"
    || status === "FAILED";
}

export function parseSseBlock(block: string): { eventName: string; data: string } | null {
  let eventName = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) eventName = line.slice("event:".length).trim();
    if (line.startsWith("data:")) data.push(line.slice("data:".length).trimStart());
  }
  return data.length ? { eventName, data: data.join("\n") } : null;
}

export function reconnectDelayMs(attempt: number): number {
  return Math.min(1_000 * 2 ** (attempt - 1), MAX_RECONNECT_DELAY_MS);
}

export async function consumeSseStream(
  response: Response,
  onReady: () => void,
  onTaskUpdate: (event: GenerationTaskUpdateEvent) => void,
  onPublicationUpdate: (event: PublicationStatusUpdateEvent) => void,
  onInteractionNotification: () => void = () => undefined,
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
      if (parsed.eventName === INTERACTION_NOTIFICATION_EVENT_NAME) { onInteractionNotification(); continue; }
      try {
        const event: unknown = JSON.parse(parsed.data);
        if (parsed.eventName === TASK_EVENT_NAME && isTaskUpdateEvent(event)) {
          onTaskUpdate(event);
        } else if (parsed.eventName === PUBLICATION_EVENT_NAME && isPublicationStatusUpdateEvent(event)) {
          onPublicationUpdate(event);
        }
      } catch {
        // REST reconciliation after the next connection remains authoritative.
      }
    }
    if (done) return;
  }
}
