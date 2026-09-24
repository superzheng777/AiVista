import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GenerationTaskStatus, GenerationTurn } from "@/entities/generation/model/generation";
import { GenerateWorkspace } from "@/features/generation/ui/generate-workspace";

const testState = vi.hoisted(() => ({
  sessionId: "session-a",
  acknowledgeSession: vi.fn(),
  turns: [] as GenerationTurn[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams({ sessionId: testState.sessionId }),
}));

vi.mock("@/features/generation/api/generation-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/generation/api/generation-api")>();
  return {
    ...actual,
    listGenerationSessions: vi.fn().mockResolvedValue({
      items: [
        {
          id: "session-a",
          title: "会话 A",
          lastMessageAt: "2026-09-24T00:00:00Z",
          latestTask: null,
          hasActiveTask: false,
        },
        {
          id: "session-b",
          title: "会话 B",
          lastMessageAt: "2026-09-24T00:00:00Z",
          latestTask: null,
          hasActiveTask: false,
        },
      ],
      nextCursor: null,
    }),
    listGenerationTurns: vi.fn().mockImplementation(async () => ({
      items: testState.turns,
      nextBefore: null,
      hasMore: false,
    })),
  };
});

vi.mock("@/features/generation/model/generation-event-stream-provider", () => ({
  useGenerationEventStream: () => ({
    acknowledgeSession: testState.acknowledgeSession,
    sessionIndicators: {},
    syncVersion: 0,
  }),
  useAgentLiveRuns: () => ({}),
}));

vi.mock("@/entities/generation/model/use-image-detail-navigation", () => ({
  useImageDetailNavigation: () => ({}),
}));

vi.mock("@/features/generation/ui/generation-composer", () => ({
  GenerationComposer: ({ sessionId }: { sessionId?: string }) => {
    const [draft, setDraft] = useState("");
    return (
      <input
        aria-label={`会话 ${sessionId ?? "new"} 输入`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    );
  },
}));

describe("GenerateWorkspace", () => {
  beforeEach(() => {
    testState.sessionId = "session-a";
    testState.acknowledgeSession.mockReset();
    testState.turns = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })),
    );
    HTMLElement.prototype.scrollTo = vi.fn();
  });

  it("remounts session-local UI state when the active conversation changes", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <GenerateWorkspace />
      </QueryClientProvider>,
    );

    const firstComposer = await screen.findByLabelText("会话 session-a 输入");
    fireEvent.change(firstComposer, { target: { value: "仅属于会话 A 的草稿" } });
    expect(firstComposer).toHaveValue("仅属于会话 A 的草稿");

    testState.sessionId = "session-b";
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <GenerateWorkspace />
      </QueryClientProvider>,
    );

    expect(await screen.findByLabelText("会话 session-b 输入")).toHaveValue("");
    expect(screen.queryByLabelText("会话 session-a 输入")).not.toBeInTheDocument();
  });

  it.each([
    { mode: "AGENT" as const, turnStatus: "RUNNING" as const, taskStatus: null, label: "创作中", spinning: true },
    { mode: "AGENT" as const, turnStatus: "SUCCEEDED" as const, taskStatus: null, label: "已完成", spinning: false },
    {
      mode: "NORMAL" as const,
      turnStatus: "RUNNING" as const,
      taskStatus: "GENERATING" as const,
      label: "正在生成图片",
      spinning: true,
    },
    {
      mode: "NORMAL" as const,
      turnStatus: "SUCCEEDED" as const,
      taskStatus: "SUCCEEDED" as const,
      label: "生成已完成",
      spinning: false,
    },
  ])(
    "shows a spinner only while $mode creation is active",
    async ({ mode, turnStatus, taskStatus, label, spinning }) => {
      testState.turns = [turnOf(mode, turnStatus, taskStatus)];
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <GenerateWorkspace />
        </QueryClientProvider>,
      );

      const status = await screen.findByText(label);
      expect(Boolean(status.querySelector("svg.animate-spin"))).toBe(spinning);
    },
  );
});

function turnOf(
  mode: GenerationTurn["mode"],
  status: GenerationTurn["status"],
  taskStatus: GenerationTaskStatus | null,
): GenerationTurn {
  return {
    id: "turn-a",
    mode,
    status,
    failureCode: null,
    revision: 0,
    userMessage: {
      id: "message-user",
      sequenceNo: 1,
      role: "USER",
      content: "生成一张测试图片",
      createdAt: "2026-09-24T00:00:00Z",
    },
    assistantMessage:
      status === "SUCCEEDED"
        ? {
            id: "message-assistant",
            sequenceNo: 2,
            role: "ASSISTANT",
            content: "创作完成。",
            createdAt: "2026-09-24T00:01:00Z",
          }
        : null,
    normalGenerationRequest: mode === "NORMAL" ? { negativePrompt: null } : null,
    generations: taskStatus
      ? [
          {
            id: "task-a",
            sessionId: "session-a",
            status: taskStatus,
            version: 0,
            retryCount: 0,
            maxRetryCount: 3,
            requestedImageCount: 1,
            completedImageCount: taskStatus === "SUCCEEDED" ? 1 : 0,
            failedImageCount: 0,
            failureCode: null,
            failureMessage: null,
            images: [],
            createdAt: "2026-09-24T00:00:00Z",
            completedAt: taskStatus === "SUCCEEDED" ? "2026-09-24T00:01:00Z" : null,
          },
        ]
      : [],
    activities: [],
    forms: [],
  };
}
