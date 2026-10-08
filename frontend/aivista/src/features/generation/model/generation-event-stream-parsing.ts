import type { CreationEvent } from "@/entities/generation/model/session";

export type GenerationStreamStatus = "DISCONNECTED" | "CONNECTING" | "SYNCING" | "READY" | "RECONNECTING";
export type GenerationSessionIndicator = "ACTIVE" | "COMPLETED" | "ATTENTION";
export const MAX_RECONNECT_DELAY_MS = 3000;

export function parseSseBlock(block: string): { eventName: string; data: string } | null {
  let eventName = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  return data.length ? { eventName, data: data.join("\n") } : null;
}
export function reconnectDelayMs(attempt: number): number {
  return Math.min(1000 * 2 ** Math.max(0, attempt - 1), MAX_RECONNECT_DELAY_MS);
}
export async function consumeSseStream(
  response: Response,
  onReady: () => void,
  onCreation: (event: CreationEvent) => void,
  onPublication: () => void,
  onNotification: () => void = () => undefined,
): Promise<void> {
  if (!response.body) throw new Error("The event stream has no response body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      pending = (pending + decoder.decode(value, { stream: !done })).replaceAll("\r\n", "\n");
      let boundary: number;
      while ((boundary = pending.indexOf("\n\n")) !== -1) {
        const parsed = parseSseBlock(pending.slice(0, boundary));
        pending = pending.slice(boundary + 2);
        if (!parsed) continue;
        if (parsed.eventName === "generation.stream.ready") {
          onReady();
          continue;
        }
        if (parsed.eventName === "interaction.notification.created") {
          onNotification();
          continue;
        }
        try {
          const event = JSON.parse(parsed.data);
          if (parsed.eventName === "publication.updated" && ["APPROVED", "REJECTED", "FAILED"].includes(event.status)) {
            onPublication();
          } else if (typeof event.sessionId === "string" && typeof event.creationId === "string") {
            if (
              parsed.eventName === "creation.updated" &&
              Number.isSafeInteger(event.revision) &&
              [
                "QUEUED",
                "RUNNING",
                "WAITING_INPUT",
                "SUCCEEDED",
                "PARTIALLY_SUCCEEDED",
                "FAILED",
                "CANCELLED",
              ].includes(event.status)
            ) {
              onCreation({ ...event, type: "creation.updated" });
            } else if (
              parsed.eventName === "creation.item.upserted" &&
              typeof event.item?.id === "string" &&
              ["text", "tool", "form", "generation"].includes(event.item.kind)
            ) {
              onCreation({ ...event, type: "creation.item.upserted" });
            }
          }
        } catch {
          /* A malformed frame does not discard subsequent events. Reconnect reconciles history. */
        }
      }
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}
