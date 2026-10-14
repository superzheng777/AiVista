import type { CreationEvent } from "@/entities/creation-session/model/session";
import { parseSseBlock } from "@/shared/lib/sse/sse";

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
