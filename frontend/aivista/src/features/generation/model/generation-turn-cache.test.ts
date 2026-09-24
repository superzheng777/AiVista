import { describe, expect, it } from "vitest";

import type { GenerationTurn } from "@/entities/generation/model/generation";
import {
  applyGenerationTaskUpdateToTurns,
  applyAgentFormUpdateToTurns,
  mergeGenerationTurnPages,
} from "@/features/generation/model/generation-turn-cache";

function turn(version: number, status: GenerationTurn["generations"][number]["status"]): GenerationTurn {
  return {
    id: "creation-task-1",
    mode: "NORMAL",
    status: status === "QUEUED" ? "RUNNING" : status === "FAILED" ? "FAILED" : "SUCCEEDED",
    failureCode: null,
    revision: 0,
    userMessage: { id: "message-1", sequenceNo: 1, role: "USER", content: "test", createdAt: "2026-08-12T00:00:00Z" },
    assistantMessage: {
      id: "message-2",
      sequenceNo: 2,
      role: "ASSISTANT",
      content: null,
      createdAt: "2026-08-12T00:00:00Z",
    },
    normalGenerationRequest: { negativePrompt: null },
    generations: [
      {
        id: "task-1",
        sessionId: "session-1",
        version,
        status,
        retryCount: 0,
        maxRetryCount: 3,
        requestedImageCount: 1,
        completedImageCount: 0,
        failedImageCount: 0,
        failureCode: null,
        failureMessage: null,
        images: [],
        createdAt: "2026-08-12T00:00:00Z",
        completedAt: null,
      },
    ],
    activities: [],
    forms: [],
  };
}

const page = (item: GenerationTurn) => ({
  pages: [{ items: [item], nextBefore: null, hasMore: false }],
  pageParams: [undefined],
});

describe("generation turn cache", () => {
  it("keeps a newer SSE state when an older REST response arrives", () => {
    const current = applyGenerationTaskUpdateToTurns(page(turn(0, "QUEUED")), {
      sessionId: "session-1",
      generationTaskId: "task-1",
      revision: 1,
      status: "SUCCEEDED",
      retryCount: 0,
      maxRetryCount: 3,
    });
    const merged = mergeGenerationTurnPages(current, page(turn(0, "QUEUED")));

    expect(merged.pages[0]?.items[0]?.generations[0]).toMatchObject({ version: 1, status: "SUCCEEDED" });
  });

  it("allows same-version REST data to fill in complete fields", () => {
    const current = applyGenerationTaskUpdateToTurns(page(turn(0, "QUEUED")), {
      sessionId: "session-1",
      generationTaskId: "task-1",
      revision: 1,
      status: "SUCCEEDED",
      retryCount: 0,
      maxRetryCount: 3,
    });
    const complete = turn(1, "SUCCEEDED");
    const [completeGeneration] = complete.generations;
    if (!completeGeneration) throw new Error("Expected the test turn to contain one generation");
    completeGeneration.completedImageCount = 1;
    completeGeneration.images = [
      {
        id: "image-1",
        sourceIndex: 0,
        imageUrls: {
          thumbnail: { url: "https://example.test/image", expiresAt: "2026-08-12T00:10:00Z" },
          display: null,
        },
        width: 2048,
        height: 2048,
        createdAt: "2026-08-12T00:00:00Z",
        favorited: false,
        finalPrompt: "test",
        finalNegativePrompt: null,
        requestedImageCount: 1,
        promptExtend: false,
        publicationReviewStatus: "NONE",
        publicationVersion: 0,
        publicAt: null,
        title: null,
        description: null,
        authorId: "user-1",
        likeCount: 0,
        likedByCurrentUser: false,
      },
    ];
    const merged = mergeGenerationTurnPages(current, page(complete));

    expect(merged.pages[0]?.items[0]?.generations[0]).toMatchObject({ completedImageCount: 1 });
    expect(merged.pages[0]?.items[0]?.generations[0]?.images).toHaveLength(1);
  });

  it("ignores a replayed SSE event with the same task version", () => {
    const current = applyGenerationTaskUpdateToTurns(page(turn(1, "FAILED")), {
      sessionId: "session-1",
      generationTaskId: "task-1",
      revision: 1,
      status: "SUCCEEDED",
      retryCount: 0,
      maxRetryCount: 3,
    });

    expect(current?.pages[0]?.items[0]?.generations[0]).toMatchObject({ version: 1, status: "FAILED" });
  });

  it("applies a full form snapshot without a REST refetch and preserves it from older REST data", () => {
    const form = {
      id: "701",
      status: "PENDING" as const,
      form: {
        schemaVersion: 2 as const,
        title: "确认海报方向",
        fields: [{ id: "subject", type: "TEXT" as const, label: "主题", required: true, value: "关爱流浪猫" }],
      },
      requestedAt: "2026-09-20T01:00:00Z",
      resolvedAt: null,
    };
    const current = applyAgentFormUpdateToTurns(page(turn(0, "QUEUED")), "creation-task-1", 1, form, "WAITING_INPUT");
    const merged = mergeGenerationTurnPages(current, page(turn(0, "QUEUED")));

    expect(merged.pages[0]?.items[0]).toMatchObject({
      revision: 1,
      status: "WAITING_INPUT",
      forms: [{ id: "701", status: "PENDING", form: { fields: [{ id: "subject", value: "关爱流浪猫" }] } }],
    });

    const cancelled = applyAgentFormUpdateToTurns(
      current,
      "creation-task-1",
      2,
      { ...form, status: "CANCELLED", resolvedAt: "2026-09-20T01:01:00Z" },
      "RUNNING",
    );
    expect(cancelled?.pages[0]?.items[0]).toMatchObject({ revision: 2, forms: [{ id: "701", status: "CANCELLED" }] });
  });
});
