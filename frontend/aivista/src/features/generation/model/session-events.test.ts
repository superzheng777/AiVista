import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { SessionDetail } from "@/entities/generation/model/session";
import { generationQueryKeys } from "../api/generation-api";
import { hydrateSession, insertCreatedTurn, receiveCreationEvent } from "./session-events";
import { sessionFixture } from "./session-events.test-fixture";

describe("session snapshots and SSE", () => {
  it("keeps sent image work live after cancelling the parent and accepts its later assets", () => {
    const client = new QueryClient();
    client.setQueryData(generationQueryKeys.session("1"), sessionFixture());
    const image = {
      id: "image-1",
      kind: "generation" as const,
      generationId: "3",
      status: "RUNNING" as const,
      assets: [],
    };
    receiveCreationEvent(client, { type: "creation.item.upserted", sessionId: "1", creationId: "2", item: image });
    receiveCreationEvent(client, {
      type: "creation.updated",
      sessionId: "1",
      creationId: "2",
      status: "CANCELLED",
      revision: 2,
    });
    let value = client.getQueryData<SessionDetail>(generationQueryKeys.session("1"))!;
    expect(value.turns[0]?.items[0]).toMatchObject({ status: "RUNNING" });
    const completed = {
      ...image,
      status: "SUCCEEDED" as const,
      assets: [{ assetId: "4", url: "https://example.test/image.png", expiresAt: null }],
    };
    receiveCreationEvent(client, { type: "creation.item.upserted", sessionId: "1", creationId: "2", item: completed });
    value = client.getQueryData<SessionDetail>(generationQueryKeys.session("1"))!;
    expect(value.turns[0]?.status).toBe("CANCELLED");
    expect(value.turns[0]?.items[0]).toEqual(completed);
    client.clear();
  });

  it("promotes the final reply without duplicating it or regressing completed tools on a stale snapshot", () => {
    const client = new QueryClient();
    client.setQueryData(generationQueryKeys.session("1"), sessionFixture());
    const emit = (item: import("@/entities/generation/model/session").SessionItem) =>
      receiveCreationEvent(client, { type: "creation.item.upserted", sessionId: "1", creationId: "2", item });
    emit({ id: "text", kind: "text", phase: "process", text: "海报已完成" });
    emit({
      id: "tool:call",
      kind: "tool",
      toolCallId: "call",
      name: "read",
      skillName: "poster-design",
      status: "SUCCEEDED",
    });
    const stale = structuredClone(client.getQueryData<SessionDetail>(generationQueryKeys.session("1"))!);
    const tool = stale.turns[0]!.items.find((item) => item.kind === "tool")!;
    tool.status = "RUNNING";
    emit({ id: "text", kind: "text", phase: "final", text: "海报已完成" });
    const result = hydrateSession(client, stale);
    expect(result.turns[0]!.items).toHaveLength(2);
    expect(result.turns[0]!.items[0]).toMatchObject({ phase: "final" });
    expect(result.turns[0]!.items[1]).toMatchObject({ status: "SUCCEEDED", skillName: "poster-design" });
    client.clear();
  });
  it("buffers events before the creation response without fetching history", () => {
    const client = new QueryClient();
    const fetch = vi.spyOn(client, "fetchQuery");
    receiveCreationEvent(client, {
      type: "creation.item.upserted",
      sessionId: "1",
      creationId: "2",
      item: { id: "text-1", kind: "text", phase: "process", text: "正在构图" },
    });
    receiveCreationEvent(client, {
      type: "creation.updated",
      sessionId: "1",
      creationId: "2",
      status: "SUCCEEDED",
      revision: 2,
    });
    insertCreatedTurn(client, { sessionId: "1", turn: sessionFixture().turns[0]! });
    const value = client.getQueryData<SessionDetail>(generationQueryKeys.session("1"))!;
    expect(value.turns[0]!).toMatchObject({ status: "SUCCEEDED", revision: 2, items: [{ text: "正在构图" }] });
    expect(fetch).not.toHaveBeenCalled();
    client.clear();
  });
  it("does not regress streamed text or terminal state on a late response", () => {
    const client = new QueryClient();
    client.setQueryData(generationQueryKeys.session("1"), sessionFixture());
    const event = {
      type: "creation.item.upserted" as const,
      sessionId: "1",
      creationId: "2",
      item: { id: "text-1", kind: "text" as const, phase: "process" as const, text: "完整的设计内容" },
    };
    receiveCreationEvent(client, event);
    receiveCreationEvent(client, event);
    receiveCreationEvent(client, {
      type: "creation.updated",
      sessionId: "1",
      creationId: "2",
      status: "SUCCEEDED",
      revision: 2,
    });
    const stale = sessionFixture();
    stale.turns[0]!.items = [{ id: "text-1", kind: "text", phase: "process", text: "完整" }];
    const result = hydrateSession(client, stale);
    expect(result.turns[0]!).toMatchObject({ status: "SUCCEEDED", revision: 2, items: [{ text: "完整的设计内容" }] });
    expect(result.turns[0]!.items).toHaveLength(1);
    expect(result.creationCount).toBe(1);
    client.clear();
  });
});
