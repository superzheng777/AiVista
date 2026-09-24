import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/features/auth/model/auth-store";
import {
  GenerationEventStreamProvider,
  useAgentLiveRuns,
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
  const liveRuns = useAgentLiveRuns();
  useEffect(onCommit);
  return <span>实时文本：{liveRuns["creation-1"]?.text ?? ""}</span>;
}

describe("GenerationEventStreamProvider", () => {
  afterEach(() => {
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
    const view = render(
      <QueryClientProvider client={queryClient}>
        <GenerationEventStreamProvider>
          <StreamStateProbe onCommit={onStreamStateCommit} />
          <LiveRunsProbe onCommit={onLiveRunsCommit} />
        </GenerationEventStreamProvider>
      </QueryClientProvider>,
    );

    await screen.findByText("连接状态：READY");
    const streamCommitsBeforeDelta = onStreamStateCommit.mock.calls.length;
    const liveCommitsBeforeDelta = onLiveRunsCommit.mock.calls.length;

    act(() => {
      streamController?.enqueue(
        encoder.encode(
          'event: agent.creation.event\ndata: {"creationId":"creation-1","sessionId":"session-1","revision":0,"streamId":"stream-1","sequence":1,"eventType":"TEXT_DELTA","payload":{"delta":"正在构图"}}\n\n',
        ),
      );
    });

    await screen.findByText("实时文本：正在构图");
    await waitFor(() => expect(onLiveRunsCommit.mock.calls.length).toBeGreaterThan(liveCommitsBeforeDelta));
    expect(onStreamStateCommit).toHaveBeenCalledTimes(streamCommitsBeforeDelta);

    view.unmount();
  });
});
