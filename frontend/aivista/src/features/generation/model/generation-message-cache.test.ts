import { describe, expect, it } from "vitest";

import type { GenerationMessage } from "@/entities/generation/model/generation";
import {
  applyGenerationTaskUpdateToMessages,
  mergeGenerationMessagePages,
} from "@/features/generation/model/generation-message-cache";

function message(version: number, status: GenerationMessage["generation"]["status"]): GenerationMessage {
  return {
    id: "message-1", sequenceNo: 1, prompt: "test", negativePrompt: null, createdAt: "2026-08-12T00:00:00Z",
    generation: {
      id: "task-1", sessionId: "session-1", version, status, retryCount: 0, maxRetryCount: 3,
      requestedImageCount: 1, completedImageCount: 0, failedImageCount: 0,
      failureCode: null, failureMessage: null, images: [], createdAt: "2026-08-12T00:00:00Z", completedAt: null,
    },
  };
}

const page = (item: GenerationMessage) => ({ pages: [{ items: [item], nextBefore: null, hasMore: false }], pageParams: [undefined] });

describe("generation message cache", () => {
  it("keeps a newer SSE state when an older REST response arrives", () => {
    const current = applyGenerationTaskUpdateToMessages(page(message(0, "QUEUED")), {
      sessionId: "session-1", taskId: "task-1", taskVersion: 1, status: "RUNNING", retryCount: 0, maxRetryCount: 3,
    });
    const merged = mergeGenerationMessagePages(current, page(message(0, "QUEUED")));

    expect(merged.pages[0].items[0].generation).toMatchObject({ version: 1, status: "RUNNING" });
  });

  it("allows same-version REST data to fill in complete fields", () => {
    const current = applyGenerationTaskUpdateToMessages(page(message(0, "QUEUED")), {
      sessionId: "session-1", taskId: "task-1", taskVersion: 1, status: "SUCCEEDED", retryCount: 0, maxRetryCount: 3,
    });
    const complete = message(1, "SUCCEEDED");
    complete.generation.completedImageCount = 1;
    complete.generation.images = [{ id: "image-1", sourceIndex: 0, imageUrls: { thumbnail: { url: "https://example.test/image", expiresAt: "2026-08-12T00:10:00Z" }, display: null }, width: 2048, height: 2048, createdAt: "2026-08-12T00:00:00Z", favorited: false, finalPrompt: "test", finalNegativePrompt: null, requestedImageCount: 1, promptExtend: false, publicationReviewStatus: "NONE", publicationVersion: 0, publicAt: null, title: null, description: null, authorId: "user-1", likeCount: 0, likedByCurrentUser: false }];
    const merged = mergeGenerationMessagePages(current, page(complete));

    expect(merged.pages[0].items[0].generation).toMatchObject({ completedImageCount: 1 });
    expect(merged.pages[0].items[0].generation.images).toHaveLength(1);
  });

  it("ignores a replayed SSE event with the same task version", () => {
    const current = applyGenerationTaskUpdateToMessages(page(message(1, "RUNNING")), {
      sessionId: "session-1", taskId: "task-1", taskVersion: 1, status: "SUCCEEDED", retryCount: 0, maxRetryCount: 3,
    });

    expect(current?.pages[0].items[0].generation).toMatchObject({ version: 1, status: "RUNNING" });
  });
});
