import { describe, expect, it } from "vitest";
import { applyCreationEvent, type CreationEvent, type SessionItem } from "@/entities/creation-session/model/session";
import { sessionFixture } from "./session-events.test-fixture";

describe("cancelled creation event handling", () => {
  it("stops activity while preserving delivered images and consuming late event cursors", () => {
    let session = sessionFixture();
    const delivered: SessionItem = { id: "delivered", kind: "generation", generationId: "10", status: "SUCCEEDED",
      assets: [{ assetId: "50", url: "https://images.test/50", expiresAt: null }] };
    session.turns[0]!.stream = { id: "stream", sequence: 0 };
    session.turns[0]!.items = [delivered,
      { id: "pending", kind: "generation", generationId: "11", status: "RUNNING", assets: [] },
      { id: "tool", kind: "tool", toolCallId: "call", name: "image_to_image", status: "RUNNING" },
      { id: "text", kind: "text", phase: "process", text: "准备生成" }];
    const envelope = { sessionId: "1", creationId: "2" };
    const apply = (event: CreationEvent) => {
      session = applyCreationEvent(session, event);
    };
    apply({ ...envelope, type: "creation.updated", status: "CANCELLED", revision: 2, streamId: "stream", sequence: 1 });
    expect(session.turns[0]!.items).toContainEqual(delivered);
    expect(session.turns[0]!.items.find(item => item.id === "pending")).toMatchObject({ status: "CANCELLED" });
    apply({ ...envelope, type: "creation.text.delta", itemId: "text", assistantMessageId: "assistant", delta: "迟到文字", offset: 4,
      streamId: "stream", sequence: 2 });
    apply({ ...envelope, type: "creation.item.upserted", item: { id: "tool", kind: "tool", toolCallId: "call",
      name: "image_to_image", status: "SUCCEEDED" }, streamId: "stream", sequence: 3 });
    apply({ ...envelope, type: "creation.updated", status: "SUCCEEDED", revision: 3, streamId: "stream", sequence: 4 });
    expect(session.turns[0]).toMatchObject({ status: "CANCELLED", stream: { id: "stream", sequence: 4 } });
    expect(session.turns[0]!.items.find(item => item.id === "text")).toMatchObject({ text: "准备生成" });
    expect(session.turns[0]!.items.find(item => item.id === "tool")).toMatchObject({ status: "CANCELLED" });
  });

  it("accepts an asset committed before cancellation even when its event arrives later", () => {
    const session = sessionFixture();
    session.turns[0]!.status = "CANCELLED";
    const next = applyCreationEvent(session, { type: "creation.item.upserted", sessionId: "1", creationId: "2",
      item: { id: "delivered", kind: "generation", generationId: "10", status: "SUCCEEDED",
        assets: [{ assetId: "50", url: "https://images.test/50", expiresAt: null }] } });
    expect(next.turns[0]!.status).toBe("CANCELLED");
    expect(next.turns[0]!.items[0]).toMatchObject({ assets: [{ assetId: "50" }] });
  });
});
