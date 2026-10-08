import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGenerationSession } from "../api/generation-api";
import { sessionFixture } from "../model/session-events.test-fixture";
import { receiveCreationEvent } from "../model/session-events";
import { GenerateWorkspace } from "./generate-workspace";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("sessionId=1"),
}));
vi.mock("../api/generation-api", async (original) => ({
  ...(await original<typeof import("../api/generation-api")>()),
  listGenerationSessions: vi.fn().mockResolvedValue([]),
  getGenerationSession: vi.fn(),
}));
const acknowledge = vi.fn();
vi.mock("../model/generation-event-stream-provider", () => ({
  useGenerationEventStream: () => ({ syncVersion: 0, acknowledgeSession: acknowledge }),
}));
vi.mock("./generation-composer", () => ({
  GenerationComposer: ({ hasActiveCreation }: { hasActiveCreation: boolean }) => (
    <button disabled={hasActiveCreation}>提交创作</button>
  ),
}));
beforeEach(() => {
  Element.prototype.scrollTo = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("GenerateWorkspace", () => {
  it("renders history and SSE into the same turn without refetching history", async () => {
    vi.mocked(getGenerationSession).mockResolvedValue(sessionFixture());
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GenerateWorkspace />
      </QueryClientProvider>,
    );
    await screen.findByText("制作海报");
    await act(async () =>
      receiveCreationEvent(client, {
        type: "creation.item.upserted",
        sessionId: "1",
        creationId: "2",
        item: { id: "text-1", kind: "text", phase: "process", text: "正在设计新的海报" },
      }),
    );
    expect(await screen.findByText("正在设计新的海报")).toBeInTheDocument();
    expect(getGenerationSession).toHaveBeenCalledOnce();
    client.clear();
  });
  it("disables new creation at the limit using a constructed session", async () => {
    const data = sessionFixture();
    data.creationCount = 30;
    data.turns[0]!.status = "SUCCEEDED";
    vi.mocked(getGenerationSession).mockResolvedValue(data);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GenerateWorkspace />
      </QueryClientProvider>,
    );
    await screen.findByText(/已达到30轮/);
    expect(screen.getByRole("button", { name: "提交创作" })).toBeDisabled();
    client.clear();
  });
});
