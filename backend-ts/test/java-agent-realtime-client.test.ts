import { afterEach, describe, expect, it, vi } from "vitest";
import { JavaAgentRealtimeClient, toWebSocketUrl } from "../src/agent/adapters/java-agent-realtime-client.js";

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  listeners = new Map<string, Array<(event: { data?: unknown }) => void>>();
  constructor(readonly url: string) { FakeSocket.instances.push(this); }
  addEventListener(type: string, listener: (event: { data?: unknown }) => void) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  send(value: string) { this.sent.push(value); }
  close() { this.fire("close"); }
  fire(type: string, event: { data?: unknown } = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  FakeSocket.instances = [];
});

describe("JavaAgentRealtimeClient", () => {
  it("authenticates once and drops events until Java confirms READY", () => {
    vi.stubGlobal("WebSocket", FakeSocket);
    const client = new JavaAgentRealtimeClient(config());
    client.onModuleInit();
    const socket = FakeSocket.instances[0]!;
    expect(socket.url).toBe("ws://127.0.0.1:8888/api/internal/agent-runtime");
    expect(client.publish("31", 4, { eventType: "RUN_STARTED", payload: {} })).toBe(false);
    socket.readyState = 1;
    socket.fire("open");
    expect(JSON.parse(socket.sent[0]!)).toEqual({ type: "HELLO", contractVersion: 1, token: "secret" });
    socket.fire("message", { data: '{"type":"READY","contractVersion":1}' });
    expect(client.publish("31", 4, { eventType: "TEXT_DELTA",
      payload: { contentIndex: 0, delta: "构图" } })).toBe(true);
    expect(JSON.parse(socket.sent[1]!)).toEqual({ type: "EVENT", event: { creationTaskId: "31",
      revision: 4, eventType: "TEXT_DELTA", payload: { contentIndex: 0, delta: "构图" } } });
    client.onModuleDestroy();
  });

  it("derives secure WebSocket URLs without retaining query credentials", () => {
    expect(toWebSocketUrl("https://example.com/api/?ignored=yes#fragment"))
      .toBe("wss://example.com/api/internal/agent-runtime");
  });

  it("delivers validated Java cancellation controls", () => {
    vi.stubGlobal("WebSocket", FakeSocket);
    const client = new JavaAgentRealtimeClient(config());
    const controls: unknown[] = [];
    client.subscribeControl((control) => controls.push(control));
    client.onModuleInit();
    const socket = FakeSocket.instances[0]!;
    socket.readyState = 1;
    socket.fire("open");
    socket.fire("message", { data: '{"type":"READY","contractVersion":1}' });
    socket.fire("message", { data: '{"type":"CANCEL","creationTaskId":"31","revision":5}' });

    expect(controls).toEqual([{ type: "READY" },
      { type: "CANCEL", creationTaskId: "31", revision: 5 }]);
    client.onModuleDestroy();
  });

  it("waits for Java READY before allowing an Agent loop to start", async () => {
    vi.stubGlobal("WebSocket", FakeSocket);
    const client = new JavaAgentRealtimeClient(config());
    client.onModuleInit();
    const socket = FakeSocket.instances[0]!;
    let resolved = false;
    const waiting = client.waitUntilReady().then(() => { resolved = true; });

    await Promise.resolve();
    expect(resolved).toBe(false);
    socket.readyState = 1;
    socket.fire("open");
    socket.fire("message", { data: '{"type":"READY","contractVersion":1}' });
    await waiting;
    expect(resolved).toBe(true);
    client.onModuleDestroy();
  });

  it("cancels a realtime readiness wait through AbortSignal", async () => {
    vi.stubGlobal("WebSocket", FakeSocket);
    const client = new JavaAgentRealtimeClient(config());
    client.onModuleInit();
    const cancellation = new AbortController();
    const waiting = client.waitUntilReady(cancellation.signal);
    cancellation.abort(new Error("cancelled"));

    await expect(waiting).rejects.toThrow("cancelled");
    client.onModuleDestroy();
  });

  it("backs off after a socket error without recursively closing the failed socket", () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
    const client = new JavaAgentRealtimeClient(config());
    client.onModuleInit();
    const socket = FakeSocket.instances[0]!;

    socket.fire("error");

    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(500);
    expect(FakeSocket.instances).toHaveLength(2);
    client.onModuleDestroy();
  });
});

function config() {
  const values: Record<string, unknown> = { AIVISTA_AGENT_ENABLED: true,
    AIVISTA_GENERATION_WORKER_TOKEN: "secret", AIVISTA_JAVA_BASE_URL: "http://127.0.0.1:8888/api" };
  return { get: vi.fn((key: string) => values[key]) } as never;
}
