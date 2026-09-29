import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GenerationAsset, GenerationTaskStatus, GenerationTurn } from "@/entities/generation/model/generation";
import { generationQueryKeys } from "@/features/generation/api/generation-api";
import {
  updateGenerationImageInTurns,
  type GenerationTurnPage,
} from "@/features/generation/model/generation-turn-cache";
import { GenerateWorkspace } from "@/features/generation/ui/generate-workspace";

const testState = vi.hoisted(() => ({
  sessionId: "session-a",
  acknowledgeSession: vi.fn(),
  setFavorites: vi.fn(),
  turns: [] as GenerationTurn[],
  turnPages: null as GenerationTurnPage[] | null,
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
    listGenerationTurns: vi.fn().mockImplementation(async (_sessionId: string, before?: string) => {
      if (testState.turnPages) {
        const pageIndex = before ? Number(before) : 0;
        return testState.turnPages[pageIndex];
      }
      return { items: testState.turns, nextBefore: null, hasMore: false };
    }),
  };
});

vi.mock("@/features/assets/api/asset-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/assets/api/asset-api")>();
  return { ...actual, setGenerationImageFavorites: testState.setFavorites };
});

vi.mock("@/features/generation/model/generation-event-stream-provider", () => ({
  useGenerationEventStream: () => ({
    acknowledgeSession: testState.acknowledgeSession,
    sessionIndicators: {},
    syncVersion: 0,
  }),
  useAgentLiveRuns: () => ({}),
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
    testState.setFavorites.mockReset();
    testState.setFavorites.mockResolvedValue(undefined);
    testState.turns = [];
    testState.turnPages = null;
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

  it("keeps the conversation image list and its detail in sync", async () => {
    const image = imageOf();
    const turn = turnOf("NORMAL", "SUCCEEDED", "SUCCEEDED");
    turn.generations[0]!.images = [image];
    testState.turns = [turn];
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <GenerateWorkspace />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "本次生成的图片" }));
    expect(screen.getByRole("button", { name: "收藏" })).toBeInTheDocument();

    act(() => {
      queryClient.setQueryData<InfiniteData<GenerationTurnPage>>(generationQueryKeys.turns("session-a"), (current) =>
        updateGenerationImageInTurns(current, image.id, (existing) => ({ ...existing, favorited: true })),
      );
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "已收藏" })).toBeInTheDocument());
  });

  it("optimistically favorites a conversation image and rolls back on failure", async () => {
    const image = imageOf();
    const turn = turnOf("NORMAL", "SUCCEEDED", "SUCCEEDED");
    turn.generations[0]!.images = [image];
    testState.turns = [turn];
    let rejectFavorite: (reason: Error) => void = () => {};
    testState.setFavorites.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectFavorite = reject;
        }),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <GenerateWorkspace />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "本次生成的图片" }));
    fireEvent.click(screen.getByRole("button", { name: "收藏" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "已收藏" })).toBeInTheDocument());
    await waitFor(() => expect(testState.setFavorites).toHaveBeenCalledWith([image.id], true));

    act(() => rejectFavorite(new Error("network failed")));
    await waitFor(() => expect(screen.getByRole("button", { name: "收藏" })).toBeInTheDocument());
  });

  it("skips deleted images when navigating within a conversation", async () => {
    const first = imageOf();
    const deleted = { ...imageOf(), id: "image-deleted", imageUrls: { thumbnail: null, display: null } };
    const last = {
      ...imageOf(),
      id: "image-last",
      imageUrls: {
        thumbnail: { url: "https://example.test/last-thumb.webp", expiresAt: "2099-01-01T00:00:00Z" },
        display: { url: "https://example.test/last.webp", expiresAt: "2099-01-01T00:00:00Z" },
      },
    };
    const turn = turnOf("NORMAL", "SUCCEEDED", "SUCCEEDED");
    turn.generations[0]!.images = [first, deleted, last];
    testState.turns = [turn];

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <GenerateWorkspace />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("图片已从资产库删除")).toBeInTheDocument();
    fireEvent.click((await screen.findAllByRole("button", { name: "本次生成的图片" }))[0]!);
    fireEvent.click(screen.getByRole("button", { name: "下一张作品" }));
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "作品详情" })).toHaveAttribute("src", last.imageUrls.display.url),
    );
    fireEvent.click(screen.getByRole("button", { name: "上一张作品" }));
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "作品详情" })).toHaveAttribute("src", first.imageUrls.display!.url),
    );
  });

  it("loads past pages containing only deleted images to find the previous image", async () => {
    const current = turnOf("NORMAL", "SUCCEEDED", "SUCCEEDED");
    current.generations[0]!.images = [imageOf()];
    const deleted = turnOf("NORMAL", "SUCCEEDED", "SUCCEEDED");
    deleted.id = "turn-deleted";
    deleted.generations[0]!.id = "task-deleted";
    deleted.generations[0]!.images = [
      { ...imageOf(), id: "image-deleted", imageUrls: { thumbnail: null, display: null } },
    ];
    const older = turnOf("NORMAL", "SUCCEEDED", "SUCCEEDED");
    older.id = "turn-older";
    older.generations[0]!.id = "task-older";
    const olderImage = {
      ...imageOf(),
      id: "image-older",
      imageUrls: {
        thumbnail: { url: "https://example.test/older-thumb.webp", expiresAt: "2099-01-01T00:00:00Z" },
        display: { url: "https://example.test/older.webp", expiresAt: "2099-01-01T00:00:00Z" },
      },
    };
    older.generations[0]!.images = [olderImage];
    testState.turnPages = [
      { items: [current], nextBefore: "1", hasMore: true },
      { items: [deleted], nextBefore: "2", hasMore: true },
      { items: [older], nextBefore: null, hasMore: false },
    ];

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <GenerateWorkspace />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "本次生成的图片" }));
    fireEvent.click(screen.getByRole("button", { name: "上一张作品" }));
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "作品详情" })).toHaveAttribute("src", olderImage.imageUrls.display.url),
    );
    fireEvent.click(screen.getByRole("button", { name: "返回上一级" }));
    expect(screen.getByText("图片已从资产库删除")).toBeInTheDocument();
  });
});

function imageOf(): GenerationAsset {
  return {
    id: "image-a",
    sourceIndex: 0,
    imageUrls: {
      thumbnail: { url: "https://example.test/thumb.webp", expiresAt: "2099-01-01T00:00:00Z" },
      display: { url: "https://example.test/display.webp", expiresAt: "2099-01-01T00:00:00Z" },
    },
    width: 1024,
    height: 1024,
    createdAt: "2026-09-24T00:00:00Z",
    favorited: false,
    finalPrompt: "测试图片",
    finalNegativePrompt: null,
    requestedImageCount: 1,
    promptExtend: false,
    publicationReviewStatus: "NONE",
    publicationVersion: 0,
    publicAt: null,
    title: null,
    description: null,
    authorId: "user-a",
    likeCount: 0,
    likedByCurrentUser: false,
  };
}

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
