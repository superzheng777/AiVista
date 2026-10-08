import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { SessionDetail } from "@/entities/generation/model/session";
import { sessionFixture } from "./session-events.test-fixture";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/features/auth/model/auth-store";
import {
  GenerationEventStreamProvider,
  useGenerationEventStream,
} from "@/features/generation/model/generation-event-stream-provider";

vi.mock("@/features/generation/model/generation-event-stream-parsing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/generation/model/generation-event-stream-parsing")>();
  return { ...actual, reconnectDelayMs: () => 0 };
});

const encoder = new TextEncoder();
let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;

function StreamStateProbe({ onCommit }: { onCommit: () => void }) {
  const { status } = useGenerationEventStream();
  useEffect(onCommit);
  return <span>连接状态：{status}</span>;
}

function LiveRunsProbe({ onCommit }: { onCommit: () => void }) {
  const { data } = useQuery<SessionDetail>({ queryKey: ["generation", "session", "1"], enabled: false });
  const item = data?.turns[0]?.items[0];
  useEffect(onCommit);
  return <span>实时文本：{item?.kind === "text" ? item.text : ""}</span>;
}

describe("GenerationEventStreamProvider", () => {
  afterEach(() => {
    cleanup();
    streamController = undefined;
    useAuthStore.setState({ accessToken: null, user: null, status: "anonymous" });
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
        <GenerationEventStreamProvider>
          <StreamStateProbe onCommit={onStreamStateCommit} />
          <LiveRunsProbe onCommit={onLiveRunsCommit} />
        </GenerationEventStreamProvider>
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

    view.unmount();
  });
});
