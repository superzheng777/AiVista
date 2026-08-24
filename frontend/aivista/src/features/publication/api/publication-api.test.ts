import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/browser-client", () => ({
  browserApiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

import { browserApiClient } from "@/shared/api/browser-client";
import {
  listMyPublications,
  removePublication,
  submitPublication,
} from "@/features/publication/api/publication-api";
import { mapGenerationAssetImage } from "@/entities/generation/model/generation";

const client = vi.mocked(browserApiClient);
const okEnvelope = { code: 0, message: "ok" } as const;

function responseData<T>(data: T): never {
  return { data: { ...okEnvelope, data } } as never;
}

describe("publication-api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submitPublication 提交标题和描述", async () => {
    client.post.mockResolvedValue(responseData({ imageId: "img-1", status: "PENDING" }));
    const result = await submitPublication("img-1", { title: "标题", description: "描述" });
    expect(client.post).toHaveBeenCalledWith(
      "/generation-images/img-1/publication",
      { title: "标题", description: "描述" },
    );
    expect(result).toEqual({ imageId: "img-1", status: "PENDING" });
  });

  it("removePublication 调用删除发布端点", async () => {
    client.delete.mockResolvedValue(responseData(null));
    await removePublication("img-1");
    expect(client.delete).toHaveBeenCalledWith("/generation-images/img-1/publication");
  });

  it("listMyPublications 映射完整图片 DTO 列表", async () => {
    const imageDto = {
      imageId: "img-1",
      imageUrls: { thumbnail: { url: "https://signed.example/img-1", expiresAt: "2026-08-10T00:10:00Z" }, display: null, original: null },
      createdAt: "2026-08-09T00:00:00Z",
      favorited: false,
      finalPrompt: "一只猫",
      finalNegativePrompt: null,
      generationConfig: { width: 1024, height: 768, requestedImageCount: 4, promptExtend: false },
      publicationReviewStatus: "APPROVED" as const,
      publicationVersion: 3,
      publicAt: "2026-08-10T00:00:00Z",
      authorId: "user-1",
      likeCount: 2,
      likedByCurrentUser: false,
      title: "作品",
      description: null,
    };
    client.get.mockResolvedValue(responseData([imageDto]));
    const result = await listMyPublications();
    expect(client.get).toHaveBeenCalledWith("/users/me/publications");
    expect(result).toEqual([mapGenerationAssetImage(imageDto)]);
    expect(result[0]).toMatchObject({ id: "img-1", publicationReviewStatus: "APPROVED", title: "作品" });
  });
});
