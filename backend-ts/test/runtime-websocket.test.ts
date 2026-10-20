import { createServer, type Server } from "node:http";
import { once } from "node:events";
import WebSocket from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RuntimeEventService } from "../src/sessions/runtime-event-service.js";
import type { CreationTurn } from "../src/sessions/session-contract.js";

const resources: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of resources.splice(0).reverse()) await close(); });
const turn = (id: string, text = "已有文字"): CreationTurn & { sessionId: string } => ({
  creationId: id, sessionId: "10", mode: "AGENT", input: { prompt: "海报", assets: [] }, settings: {},
  status: "RUNNING", revision: 1, createdAt: new Date().toISOString(), completedAt: null, failureCode: null,
  items: [{ id: "text", kind: "text", assistantMessageId: "assistant", phase: "process", text }],
});

async function start() {
  const events = new RuntimeEventService({ get: () => "secret" } as never);
  const http: Server = createServer((_, response) => response.end()); events.attach(http);
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  resources.push(async () => { events.onModuleDestroy(); await new Promise<void>((resolve) => http.close(() => resolve())); });
  const address = http.address(); if (!address || typeof address === "string") throw new Error("No listener");
  const port = address.port;
  events.activeIds = async () => [];
  events.resolveTurn = async (user, id) => { if (user === "2" && id !== "4") throw new Error("Not owned"); return { ...(await events.snapshot([id], async () => [turn(id)]))[0]!, sessionId: "10" }; };
  async function connect(user: string) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/internal/events`, {
      headers: { "X-AiVista-Worker-Token": "secret", "X-AiVista-User-Id": user },
    });
    const messages: Array<Record<string, any>> = [];
    socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
    await once(socket, "open");
    await vi.waitFor(() => expect(messages.some((event) => event.type === "runtime.ready")).toBe(true));
    return { socket, messages };
  }
  return { events, connect, url: `ws://127.0.0.1:${address.port}/internal/events` };
}

describe("internal user WebSocket", () => {
  it("re-reads a snapshot crossed by an event and shares its cursor with WS sync", async () => {
    const { events, connect } = await start();
    let finish!: (value: CreationTurn[]) => void;
    const read = vi.fn().mockImplementationOnce(() => new Promise<CreationTurn[]>((resolve) => { finish = resolve; }))
      .mockImplementation(async () => [turn("1", "已有文字继续")]);
    const pending = events.snapshot(["1"], read);
    await events.publish([{ userId: "1", sessionId: "10", creationId: "1", type: "creation.text.delta",
      itemId: "text", assistantMessageId: "assistant", offset: 4, delta: "继续" }]);
    finish([turn("1")]);
    const snapshot = (await pending)[0]!;
    expect(read).toHaveBeenCalledTimes(2);
    expect(snapshot.items[0]).toMatchObject({ text: "已有文字继续" });
    expect(snapshot.stream.sequence).toBe(1);
    events.resolveTurn = async () => ({ ...snapshot, sessionId: "10" });
    const client = await connect("1");
    client.socket.send(JSON.stringify({ type: "sync", creationIds: ["1"] }));
    await vi.waitFor(() => expect(client.messages.some((event) => event.type === "creation.snapshot")).toBe(true));
    const ws = client.messages.find((event) => event.type === "creation.snapshot")!;
    expect(ws.streamId).toBe(snapshot.stream.id);
    expect(ws.sequence).toBe(snapshot.stream.sequence);
    expect(ws.turn.stream).toEqual(snapshot.stream);
  });

  it("multiplexes three creations and isolates users without accumulating text in the transport", async () => {
    const { events, connect } = await start(); const a = await connect("1"); const b = await connect("2");
    for (const id of ["1", "2", "3"]) await events.publish([{ userId: "1", sessionId: "10", creationId: id,
      type: "creation.text.delta", itemId: "text", assistantMessageId: "assistant", offset: 0, delta: `消息${id}` }]);
    await vi.waitFor(() => expect(a.messages.filter((event) => event.type === "creation.text.delta")).toHaveLength(3));
    expect(b.messages).toHaveLength(1);
    expect(a.messages.slice(1).map((event) => event.sequence)).toEqual([1, 1, 1]);
    expect(a.messages.slice(1).map((event) => event.delta)).toEqual(["消息1", "消息2", "消息3"]);
  });

  it("reconnects to the current snapshot and continues the same creation sequence", async () => {
    const { events, connect } = await start(); const first = await connect("1");
    first.socket.close(); await once(first.socket, "close");
    await events.publish([{ userId: "1", sessionId: "10", creationId: "1", type: "creation.text.delta",
      itemId: "text", assistantMessageId: "assistant", offset: 0, delta: "已有文字" }]);
    const resumed = await connect("1"); resumed.socket.send(JSON.stringify({ type: "sync", creationIds: ["1"] }));
    await vi.waitFor(() => expect(resumed.messages.some((event) => event.type === "creation.snapshot")).toBe(true));
    const snapshot = resumed.messages.find((event) => event.type === "creation.snapshot")!;
    expect(snapshot.sequence).toBe(1); expect(snapshot.turn.items[0].text).toBe("已有文字");
    await events.publish([{ userId: "1", sessionId: "10", creationId: "1", type: "creation.text.delta",
      itemId: "text", assistantMessageId: "assistant", offset: 4, delta: "继续" }]);
    await vi.waitFor(() => expect(resumed.messages.at(-1)?.sequence).toBe(2));
    expect(resumed.messages.at(-1)?.streamId).toBe(snapshot.streamId);
  });

  it("rejects a bad internal credential and another user's snapshot request", async () => {
    const { connect, url } = await start();
    const bad = new WebSocket(url, { headers: { "X-AiVista-Worker-Token": "wrong", "X-AiVista-User-Id": "1" } });
    bad.on("error", () => undefined);
    const status = await new Promise<number>((resolve) => bad.on("unexpected-response", (request, response) => {
      resolve(response.statusCode!); response.resume(); request.destroy();
    }));
    expect(status).toBe(401);
    const other = await connect("2");
    const closed = once(other.socket, "close"); other.socket.send(JSON.stringify({ type: "sync", creationIds: ["1"] }));
    expect((await closed)[0]).toBe(1008);
    expect(other.messages.some((event) => event.type === "creation.snapshot")).toBe(false);
  });
});
