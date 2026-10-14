import { describe, expect, it, vi } from "vitest";
import { consumeSseStream } from "./user-event-stream-consumer";

describe("SSE parsing", () => {
  it("handles split CRLF frames, malformed JSON, and community events", async () => {
    const ready = vi.fn(),
      creation = vi.fn(),
      publication = vi.fn(),
      notification = vi.fn();
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of [
          "event: generation.stream.ready\r",
          "\ndata: {}\r\n\r",
          "\n",
          "event: creation.updated\ndata: invalid\n\n",
          'event: creation.updated\ndata: {"sessionId":"1","creationId":"2","revision":2,"status":"SUCCEEDED"}\n\n',
          'event: publication.updated\ndata: {"status":"APPROVED"}\n\n',
          "event: interaction.notification.created\ndata: {}\n\n",
        ])
          controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    await consumeSseStream(new Response(body), ready, creation, publication, notification);
    expect(ready).toHaveBeenCalledOnce();
    expect(creation).toHaveBeenCalledExactlyOnceWith({
      type: "creation.updated",
      sessionId: "1",
      creationId: "2",
      revision: 2,
      status: "SUCCEEDED",
    });
    expect(publication).toHaveBeenCalledOnce();
    expect(notification).toHaveBeenCalledOnce();
  });
});
