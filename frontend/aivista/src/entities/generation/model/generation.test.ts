import { describe, expect, it } from "vitest";

import { mapGenerationAssetImage, needsImageUrlRefresh, type GenerationAssetImageDto } from "@/entities/generation/model/generation";

const dto: GenerationAssetImageDto = {
  imageId: "img-1",
  sourceIndex: 0,
  imageUrls: { thumbnail: { url: "https://signed.example/img-1", expiresAt: "2026-08-10T00:10:00Z" }, display: null, original: null },
  createdAt: "2026-08-09T00:00:00Z",
  favorited: true,
  finalPrompt: "一只戴帽子的猫",
  finalNegativePrompt: "模糊",
  generationConfig: { width: 1024, height: 768, requestedImageCount: 4, promptExtend: true },
  publicationReviewStatus: "PENDING",
  publicationVersion: 2,
  publicAt: null,
  authorId: "author-1",
  likeCount: 3,
  likedByCurrentUser: true,
  title: "我的作品",
  description: "描述文本",
};

describe("mapGenerationAssetImage", () => {
  it("把完整图片 DTO 展开到资产领域模型", () => {
    expect(mapGenerationAssetImage(dto)).toEqual({
      id: "img-1",
      sourceIndex: 0,
      imageUrls: { thumbnail: { url: "https://signed.example/img-1", expiresAt: "2026-08-10T00:10:00Z" }, display: null, original: null },
      createdAt: "2026-08-09T00:00:00Z",
      favorited: true,
      finalPrompt: "一只戴帽子的猫",
      finalNegativePrompt: "模糊",
      width: 1024,
      height: 768,
      requestedImageCount: 4,
      promptExtend: true,
      publicationReviewStatus: "PENDING",
      publicationVersion: 2,
      publicAt: null,
      authorId: "author-1",
      likeCount: 3,
      likedByCurrentUser: true,
      title: "我的作品",
      description: "描述文本",
    });
  });

  it("透传 null 业务字段", () => {
    const mapped = mapGenerationAssetImage({ ...dto, finalNegativePrompt: null, publicAt: null, title: null, description: null });
    expect(mapped.finalNegativePrompt).toBeNull();
    expect(mapped.publicAt).toBeNull();
    expect(mapped.title).toBeNull();
    expect(mapped.description).toBeNull();
  });
});

describe("needsImageUrlRefresh", () => {
  it("keeps a URL that has not expired", () => {
    expect(needsImageUrlRefresh({ url: "https://example.test", expiresAt: "2026-08-11T12:00:01.000Z" }, Date.parse("2026-08-11T12:00:00.000Z"))).toBe(false);
  });

  it("refreshes an expired or malformed URL", () => {
    expect(needsImageUrlRefresh({ url: "https://example.test", expiresAt: "2026-08-11T12:00:00.000Z" }, Date.parse("2026-08-11T12:00:00.000Z"))).toBe(true);
    expect(needsImageUrlRefresh({ url: "https://example.test", expiresAt: "not-a-date" }, Date.parse("2026-08-11T12:00:00.000Z"))).toBe(true);
  });
});
