import type { SessionDetail } from "@/entities/creation-session/model/session";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { generationQueryKeys } from "../api/generation-api";
import {
  clearSessionEvents,
  forgetSessionEvents,
  loadSessionSnapshot,
  insertCreatedTurn,
  isSessionDeleted,
  receiveCreationEvent,
} from "./session-events";
import { sessionFixture } from "./session-events.test-fixture";

describe("session snapshots and WebSocket", () => {
  it("keeps an early WS snapshot when the creation POST arrives later", () => {
    const client = new QueryClient();
    const turn = sessionFixture().turns[0]!;
    receiveCreationEvent(client, {
      type: "creation.snapshot",
      sessionId: "1",
      creationId: "2",
      streamId: "run",
      sequence: 3,
      turn: { ...turn, items: [{ id: "text", kind: "text", phase: "final", text: "已完成" }] },
    });
    insertCreatedTurn(client, { sessionId: "1", turn });
    expect(client.getQueryData<SessionDetail>(generationQueryKeys.session("1"))!.turns[0]!.items[0]).toMatchObject({
      phase: "final",
      text: "已完成",
    });
    client.clear();
  });

  it.each([0, 1, 2])(
    "uses snapshot sequence %i as the boundary, without losing or duplicating buffered deltas",
    async (sequence) => {
      const client = new QueryClient();
      let finish!: (value: SessionDetail) => void;
      const pending = loadSessionSnapshot(
        client,
        "1",
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const delta = (seq: number, offset: number, text: string) =>
        receiveCreationEvent(client, {
          type: "creation.text.delta",
          sessionId: "1",
          creationId: "2",
          streamId: "run",
          sequence: seq,
          itemId: "text",
          assistantMessageId: "assistant",
          offset,
          delta: text,
        });
      // No HTTP baseline yet. These events still need to be replayed once it arrives.
      delta(1, 0, "我会");
      delta(2, 2, "先读取");
      const snapshot = sessionFixture();
      snapshot.title = "服务端新标题";
      snapshot.turns[0]!.stream = { id: "run", sequence };
      snapshot.turns[0]!.items =
        sequence === 0
          ? []
          : [{ id: "text", kind: "text", phase: "process", text: sequence === 1 ? "我会" : "我会先读取" }];
      finish(snapshot);
      const result = await pending;
      expect(result.title).toBe("服务端新标题");
      expect(result.turns[0]).toMatchObject({ stream: { id: "run", sequence: 2 }, items: [{ text: "我会先读取" }] });
      client.setQueryData(generationQueryKeys.session("1"), result);
      delta(3, 5, "技能");
      expect(client.getQueryData<SessionDetail>(generationQueryKeys.session("1"))!.turns[0]!.items[0]).toMatchObject({
        text: "我会先读取技能",
      });
      client.clear();
    },
  );

  it("accepts newer HTTP content and renewed URLs even when the cache already has a stream", async () => {
    const client = new QueryClient();
    const old = sessionFixture();
    old.turns[0]!.stream = { id: "run", sequence: 1 };
    old.turns[0]!.items = [{ id: "text", kind: "text", phase: "process", text: "旧的较长内容" }];
    client.setQueryData(generationQueryKeys.session("1"), old);
    const fresh = sessionFixture();
    fresh.turns[0]!.stream = { id: "run", sequence: 2 };
    fresh.turns[0]!.items = [
      { id: "text", kind: "text", phase: "final", text: "已完成" },
      {
        id: "image",
        kind: "generation",
        generationId: "3",
        status: "SUCCEEDED",
        assets: [{ assetId: "4", url: "https://example.test/renewed", expiresAt: "2026-10-21T01:00:00Z" }],
      },
    ];
    expect(await loadSessionSnapshot(client, "1", async () => fresh)).toEqual(fresh);
    client.clear();
  });

  it("uses an HTTP baseline immediately for subsequent WS deltas, without requiring a WS snapshot first", async () => {
    const client = new QueryClient();
    const snapshot = sessionFixture();
    snapshot.turns[0]!.stream = { id: "run", sequence: 0 };
    await client.fetchQuery({
      queryKey: generationQueryKeys.session("1"),
      queryFn: () => loadSessionSnapshot(client, "1", async () => snapshot),
    });
    expect(
      receiveCreationEvent(client, {
        type: "creation.text.delta",
        sessionId: "1",
        creationId: "2",
        streamId: "run",
        sequence: 1,
        itemId: "text",
        assistantMessageId: "assistant",
        offset: 0,
        delta: "开始创作",
      }),
    ).toBe(true);
    expect(client.getQueryData<SessionDetail>(generationQueryKeys.session("1"))!.turns[0]!.items[0]).toMatchObject({
      text: "开始创作",
    });
    client.clear();
  });

  it("replays tool and final status events after the snapshot, and does not retain a failed request's buffer", async () => {
    const client = new QueryClient();
    let fail!: (reason: Error) => void;
    const failed = loadSessionSnapshot(
      client,
      "1",
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    );
    receiveCreationEvent(client, {
      type: "creation.updated",
      sessionId: "1",
      creationId: "2",
      status: "CANCELLED",
      revision: 99,
    });
    fail(new Error("network"));
    await expect(failed).rejects.toThrow("network");
    let finish!: (value: SessionDetail) => void;
    const pending = loadSessionSnapshot(
      client,
      "1",
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    receiveCreationEvent(client, {
      type: "creation.item.upserted",
      sessionId: "1",
      creationId: "2",
      streamId: "run",
      sequence: 1,
      item: { id: "tool", kind: "tool", toolCallId: "call", name: "read", status: "FAILED" },
    });
    receiveCreationEvent(client, {
      type: "creation.updated",
      sessionId: "1",
      creationId: "2",
      streamId: "run",
      sequence: 2,
      status: "SUCCEEDED",
      revision: 2,
    });
    const snapshot = sessionFixture();
    snapshot.turns[0]!.stream = { id: "run", sequence: 0 };
    finish(snapshot);
    expect((await pending).turns[0]).toMatchObject({ status: "SUCCEEDED", revision: 2, items: [{ status: "FAILED" }] });
    client.clear();
  });

  it("discards deleted session events without clearing other sessions and resets on logout", () => {
    const client = new QueryClient();
    const event = {
      type: "creation.updated" as const,
      sessionId: "1",
      creationId: "2",
      status: "SUCCEEDED" as const,
      revision: 2,
    };
    client.setQueryData(generationQueryKeys.session("other"), { ...sessionFixture(), sessionId: "other" });
    receiveCreationEvent(client, { ...event, sessionId: "other" });
    forgetSessionEvents(client, "1");
    expect(isSessionDeleted(client, "1")).toBe(true);
    expect(receiveCreationEvent(client, event)).toBe(false);
    expect(client.getQueryData<SessionDetail>(generationQueryKeys.session("other"))!.turns[0]?.status).toBe(
      "SUCCEEDED",
    );
    expect(client.getQueryData(generationQueryKeys.session("1"))).toBeUndefined();
    clearSessionEvents(client);
    expect(isSessionDeleted(client, "1")).toBe(false);
    expect(
      receiveCreationEvent(client, {
        type: "creation.snapshot",
        sessionId: "1",
        creationId: "2",
        turn: sessionFixture().turns[0]!,
      }),
    ).toBe(true);
    client.clear();
  });
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

  it("requests a snapshot for an unknown delta without buffering an incomplete suffix", () => {
    const client = new QueryClient();
    const fetch = vi.spyOn(client, "fetchQuery");
    expect(
      receiveCreationEvent(client, {
        type: "creation.text.delta",
        sessionId: "1",
        creationId: "2",
        streamId: "run",
        sequence: 2,
        itemId: "text",
        assistantMessageId: "assistant",
        offset: 2,
        delta: "尾段",
      }),
    ).toBe(false);
    insertCreatedTurn(client, { sessionId: "1", turn: sessionFixture().turns[0]! });
    const value = client.getQueryData<SessionDetail>(generationQueryKeys.session("1"))!;
    expect(value.turns[0]!.items).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    client.clear();
  });
});
