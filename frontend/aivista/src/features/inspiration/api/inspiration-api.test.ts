import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/browser-client", () => ({ browserApiClient: { get: vi.fn(), put: vi.fn(), delete: vi.fn() } }));

import { listFollowingInspirations, listInspirations } from "@/features/inspiration/api/inspiration-api";
import { browserApiClient } from "@/shared/api/browser-client";

const client = vi.mocked(browserApiClient);
const image = {
  imageId: "11",
  url: "https://oss.example/signed",
  urlExpiresAt: "2026-08-15T00:10:00Z",
  createdAt: "2026-08-15T00:00:00Z",
  favorited: false,
  finalPrompt: "prompt",
  finalNegativePrompt: null,
  generationConfig: { width: 1024, height: 1024, requestedImageCount: 1, promptExtend: true },
  publicationReviewStatus: "APPROVED",
  publicationVersion: 1,
  publicAt: "2026-08-15T00:00:00Z",
  title: "作品",
  description: null,
  authorId: "7",
  likeCount: 0,
  likedByCurrentUser: false,
};
const response = (nextCursor: string | null) => ({ data: { code: 0, message: "ok", data: { items: [image], nextCursor } } } as never);

describe("inspiration-api", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps discovery and following endpoints separate", async () => {
    client.get.mockResolvedValueOnce(response("discovery-cursor")).mockResolvedValueOnce(response("following-cursor"));

    await expect(listInspirations(null)).resolves.toMatchObject({ items: [{ id: "11" }], nextCursor: "discovery-cursor" });
    await expect(listFollowingInspirations("cursor-1")).resolves.toMatchObject({ items: [{ id: "11" }], nextCursor: "following-cursor" });

    expect(client.get).toHaveBeenNthCalledWith(1, "/inspirations", { params: undefined });
    expect(client.get).toHaveBeenNthCalledWith(2, "/inspirations/following", { params: { cursor: "cursor-1" } });
  });
});
