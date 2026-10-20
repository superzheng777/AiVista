import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/model/auth-store";
import { useUserEventStreamStore } from "@/entities/user-event-stream/model/user-event-stream-store";
import type { CurrentUser } from "@/entities/user/model/user";
import type { SessionDetail } from "@/entities/creation-session/model/session";
import { sessionFixture } from "@/features/generation/model/session-events.test-fixture";
import { UserEventStreamInitializer } from "./user-event-stream-initializer";

class Socket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: Socket[] = [];
  readyState = 0;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: (event: { code: number }) => void;
  onerror?: () => void;
  send = vi.fn();
  constructor(readonly url: URL) {
    Socket.instances.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  emit(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
  close(code = 1000) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

describe("authenticated user WebSocket", () => {
  beforeEach(() => {
    Socket.instances = [];
    vi.stubGlobal("WebSocket", Socket);
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    useAuthStore.setState(useAuthStore.getInitialState(), true);
    useUserEventStreamStore.setState(useUserEventStreamStore.getInitialState(), true);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  function mount() {
    useAuthStore.setState({ status: "authenticated", accessToken: "token-a", user: { id: "1" } as CurrentUser });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <UserEventStreamInitializer />
      </QueryClientProvider>,
    );
    return { client, socket: Socket.instances[0]! };
  }
  function ready(socket: Socket) {
    socket.open();
    socket.emit({ type: "user.ready" });
  }
  const cursor = { streamId: "stream", sequence: 0 };

  it("stays disconnected anonymously and authenticates through the first frame", () => {
    const client = new QueryClient();
    const view = render(
      <QueryClientProvider client={client}>
        <UserEventStreamInitializer />
      </QueryClientProvider>,
    );
    expect(Socket.instances).toHaveLength(0);
    view.unmount();
    const { socket } = mount();
    act(() => ready(socket));
    expect(socket.url.pathname).toBe("/api/ws/events");
    expect(socket.url.search).toBe("");
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: "authenticate", accessToken: "token-a" }));
    expect(useUserEventStreamStore.getState().status).toBe("READY");
  });

  it("multiplexes separate creations, repairs gaps, and never appends duplicate deltas", () => {
    const { client, socket } = mount();
    act(() => ready(socket));
    for (const [sessionId, creationId] of [
      ["1", "2"],
      ["3", "4"],
      ["5", "6"],
    ]) {
      const fixture = sessionFixture();
      const turn = { ...fixture.turns[0]!, creationId, items: [] };
      act(() => socket.emit({ type: "creation.snapshot", sessionId, creationId, ...cursor, turn }));
      const delta = {
        type: "creation.text.delta",
        sessionId,
        creationId,
        ...cursor,
        sequence: 1,
        itemId: "text",
        assistantMessageId: "assistant",
        offset: 0,
        delta: `内容${creationId}`,
      };
      act(() => {
        socket.emit(delta);
        socket.emit(delta);
      });
      expect(
        client.getQueryData<SessionDetail>(["generation", "session", sessionId])?.turns[0]?.items[0],
      ).toMatchObject({ text: `内容${creationId}` });
    }
    act(() =>
      socket.emit({
        type: "creation.text.delta",
        sessionId: "1",
        creationId: "2",
        ...cursor,
        sequence: 5,
        itemId: "text",
        assistantMessageId: "assistant",
        offset: 10,
        delta: "缺口",
      }),
    );
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: "sync", creationIds: ["2"] }));
    client.clear();
  });

  it("refreshes an expired token through the existing auth action before reconnecting", async () => {
    const { client, socket } = mount();
    const refresh = vi.fn(async () => {
      useAuthStore.setState({ accessToken: "token-b" });
      return "token-b";
    });
    useAuthStore.setState({ refreshAccessToken: refresh });
    act(() => ready(socket));
    await act(async () => {
      socket.close(4001);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    const next = Socket.instances[1]!;
    act(() => ready(next));
    expect(next.send).toHaveBeenCalledWith(JSON.stringify({ type: "authenticate", accessToken: "token-b" }));
    client.clear();
  });

  it("reconnects without cancelling work and ignores frames from a previous identity", async () => {
    const { client, socket } = mount();
    act(() => ready(socket));
    act(() => socket.close(1006));
    expect(useUserEventStreamStore.getState().status).toBe("RECONNECTING");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(Socket.instances).toHaveLength(2);
    act(() => ready(Socket.instances[1]!));
    const before = useUserEventStreamStore.getState().notificationRefreshVersion;
    act(() => socket.emit({ type: "interaction.notification.created" }));
    expect(useUserEventStreamStore.getState().notificationRefreshVersion).toBe(before);
    act(() => useAuthStore.setState({ status: "anonymous", user: null, accessToken: null }));
    expect(Socket.instances[1]?.readyState).toBe(Socket.CLOSED);
    expect(useUserEventStreamStore.getState().status).toBe("DISCONNECTED");
    client.clear();
  });
});
