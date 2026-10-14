import type { SessionDetail } from "@/entities/creation-session/model/session";
import { useUserEventStreamStore } from "@/entities/user-event-stream/model/user-event-stream-store";
import type { CurrentUser } from "@/entities/user/model/user";
import { useAuthStore } from "@/features/auth/model/auth-store";
import { sessionFixture } from "@/features/generation/model/session-events.test-fixture";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserEventStreamInitializer } from "./user-event-stream-initializer";

vi.mock("@/shared/lib/sse/sse", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/lib/sse/sse")>();
  return { ...actual, reconnectDelayMs: () => 0 };
});

const encoder = new TextEncoder();

let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;

function StreamStateProbe({ onCommit }: { onCommit: () => void }) {
  const status = useUserEventStreamStore((state) => state.status);
  useEffect(onCommit);
  return <span>连接状态：{status}</span>;
}

function LiveRunsProbe({ onCommit }: { onCommit: () => void }) {
  const { data } = useQuery<SessionDetail>({ queryKey: ["generation", "session", "1"], enabled: false });
  const item = data?.turns[0]?.items[0];
  useEffect(onCommit);
  return <span>实时文本：{item?.kind === "text" ? item.text : ""}</span>;
}

describe("UserEventStreamInitializer", () => {
  afterEach(() => {
    cleanup();
    streamController = undefined;
    useAuthStore.setState(useAuthStore.getInitialState(), true);
    useUserEventStreamStore.setState(useUserEventStreamStore.getInitialState(), true);
    vi.unstubAllGlobals();
  });

  it("does not rerender low-frequency consumers when a text delta updates live runs", async () => {
    const onStreamStateCommit = vi.fn();
    const onLiveRunsCommit = vi.fn();
    useAuthStore.setState({ accessToken: "access-token", status: "authenticated" });
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            streamController = controller;
            controller.enqueue(encoder.encode("event: generation.stream.ready\ndata: {}\n\n"));
            init?.signal?.addEventListener("abort", () => controller.close(), { once: true });
          },
        });
        return Promise.resolve(new Response(body, { status: 200 }));
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["generation", "session", "1"], sessionFixture());
    const view = render(
      <QueryClientProvider client={queryClient}>
        <>
          <UserEventStreamInitializer />
          <StreamStateProbe onCommit={onStreamStateCommit} />
          <LiveRunsProbe onCommit={onLiveRunsCommit} />
        </>
      </QueryClientProvider>,
    );

    await screen.findByText("连接状态：READY");
    // Commit READY effects before measuring updates caused by the next stream chunk.
    await act(async () => {});
    const streamCommitsBeforeDelta = onStreamStateCommit.mock.calls.length;
    const liveCommitsBeforeDelta = onLiveRunsCommit.mock.calls.length;

    await act(async () => {
      streamController?.enqueue(
        encoder.encode(
          'event: creation.item.upserted\ndata: {"creationId":"2","sessionId":"1","item":{"id":"text-1","kind":"text","text":"正在构图"}}\n\n',
        ),
      );
    });

    await screen.findByText("实时文本：正在构图");
    await waitFor(() => expect(onLiveRunsCommit.mock.calls.length).toBeGreaterThan(liveCommitsBeforeDelta));
    expect(onStreamStateCommit).toHaveBeenCalledTimes(streamCommitsBeforeDelta);

    queryClient.setQueryData(["assets"], []);
    queryClient.setQueryData(["publication", "mine"], []);
    await act(async () => {
      streamController?.enqueue(
        encoder.encode(
          'event: publication.updated\ndata: {"imageId":"image-1","publicationVersion":1,"status":"APPROVED","publicAt":null}\n\n',
        ),
      );
      await Promise.resolve();
    });
    await waitFor(() => expect(queryClient.getQueryState(["assets"])?.isInvalidated).toBe(true));
    expect(queryClient.getQueryState(["publication", "mine"])?.isInvalidated).toBe(true);
    expect(onStreamStateCommit).toHaveBeenCalledTimes(streamCommitsBeforeDelta);

    view.unmount();
  });
});

const viewer: CurrentUser = {
  id: "viewer-a",
  loginName: "viewer-a",
  nickname: "Viewer",
  avatarUrl: null,
  bio: null,
  createdAt: "2026-10-01",
  updatedAt: "2026-10-01",
};

function mountConnection({ strict = false, ignoreAbort = false } = {}) {
  const streams: ReadableStreamDefaultController<Uint8Array>[] = [];
  const signals: AbortSignal[] = [];
  const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        streams.push(controller);
        signals.push(init!.signal!);
        controller.enqueue(encoder.encode("event: generation.stream.ready\ndata: {}\n\n"));
        if (!ignoreAbort)
          init!.signal!.addEventListener(
            "abort",
            () => {
              try {
                controller.close();
              } catch {
                /* Already closed by the server. */
              }
            },
            { once: true },
          );
      },
    });
    return Promise.resolve(new Response(body));
  });
  vi.stubGlobal("fetch", fetcher);
  useAuthStore.setState({ status: "authenticated", user: viewer, accessToken: "token-a" });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <UserEventStreamInitializer />
    </QueryClientProvider>,
    { reactStrictMode: strict },
  );
  return { streams, signals, fetcher, client, ...view };
}

describe("realtime store lifecycle", () => {
  afterEach(() => {
    cleanup();
    useAuthStore.setState(useAuthStore.getInitialState(), true);
    useUserEventStreamStore.setState(useUserEventStreamStore.getInitialState(), true);
    vi.unstubAllGlobals();
  });

  it("shares readiness requests under Strict Mode and reconnects after the stream ends", async () => {
    const { streams, signals, fetcher, unmount, client } = mountConnection({ strict: true });
    const results = await Promise.all([
      useUserEventStreamStore.getState().ensureReady(),
      useUserEventStreamStore.getState().ensureReady(),
      useUserEventStreamStore.getState().retryNow(),
    ]);
    expect(results).toEqual([true, true, true]);
    expect(signals.filter((signal) => !signal.aborted)).toHaveLength(1);
    const calls = fetcher.mock.calls.length;
    expect(useUserEventStreamStore.getState().syncVersion).toBe(1);
    await act(async () => streams.at(-1)!.close());
    await waitFor(() => expect(useUserEventStreamStore.getState().syncVersion).toBe(2));
    expect(fetcher).toHaveBeenCalledTimes(calls + 1);
    expect(signals.filter((signal) => !signal.aborted)).toHaveLength(1);
    unmount();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(await useUserEventStreamStore.getState().ensureReady()).toBe(false);
    expect(await useUserEventStreamStore.getState().retryNow()).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(calls + 1);
    client.clear();
  });

  it("resets shared state on identity changes and ignores late events from the old connection", async () => {
    const { streams, signals, client, unmount } = mountConnection({ ignoreAbort: true });
    await waitFor(() => expect(useUserEventStreamStore.getState().status).toBe("READY"));
    act(() =>
      useUserEventStreamStore.setState({
        completedSessionIds: new Set(["old-session"]),
        attentionSessionIds: new Set(["old-failure"]),
        notificationRefreshVersion: 5,
        publicationRefreshVersion: 3,
      }),
    );
    act(() => useAuthStore.setState({ user: { ...viewer, id: "viewer-b" }, accessToken: "token-b" }));
    await waitFor(() => expect(streams).toHaveLength(2));
    await waitFor(() => expect(useUserEventStreamStore.getState().status).toBe("READY"));
    expect(signals[0]!.aborted).toBe(true);
    expect(useUserEventStreamStore.getState().completedSessionIds.size).toBe(0);
    expect(useUserEventStreamStore.getState().attentionSessionIds.size).toBe(0);
    expect(useUserEventStreamStore.getState().publicationRefreshVersion).toBe(0);
    await act(async () =>
      streams[0]!.enqueue(
        encoder.encode(
          'event: interaction.notification.created\ndata: {}\n\nevent: creation.updated\ndata: {"sessionId":"old-session","creationId":"old-creation","revision":1,"status":"FAILED"}\n\n',
        ),
      ),
    );
    expect(useUserEventStreamStore.getState().notificationRefreshVersion).toBe(0);
    expect(useUserEventStreamStore.getState().attentionSessionIds.size).toBe(0);
    act(() => useAuthStore.setState({ status: "anonymous", user: null, accessToken: null }));
    expect(useUserEventStreamStore.getState().status).toBe("DISCONNECTED");
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(await useUserEventStreamStore.getState().ensureReady()).toBe(false);
    unmount();
    streams.forEach((stream) => stream.close());
    client.clear();
  });
  it("stops readiness waiting on logout even when token refresh is still pending", async () => {
    let resolveToken!: (token: string) => void;
    const refresh = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveToken = resolve;
        }),
    );
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    useAuthStore.setState({ status: "authenticated", user: viewer, accessToken: null, refreshAccessToken: refresh });
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <UserEventStreamInitializer />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    const waiting = useUserEventStreamStore.getState().ensureReady();
    act(() => useAuthStore.setState({ status: "anonymous", user: null }));
    expect(await waiting).toBe(false);
    await act(async () => resolveToken("late-token"));
    expect(fetcher).not.toHaveBeenCalled();
    expect(useUserEventStreamStore.getState().status).toBe("DISCONNECTED");
    client.clear();
  });
});
