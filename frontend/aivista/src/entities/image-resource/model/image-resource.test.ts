import { describe, expect, it } from "vitest";
import {
  isImageUrlExpired,
  mapGenerationAssetImage,
  needsImageUrlRefresh,
  type GenerationAssetImageDto,
} from "./image-resource";

const dto: GenerationAssetImageDto = {
  imageId: "img-1",
  sourceIndex: 0,
  imageUrls: { thumbnail: { url: "https://signed.example/img-1", expiresAt: "2026-08-10T00:10:00Z" }, display: null },
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
      imageUrls: {
        thumbnail: { url: "https://signed.example/img-1", expiresAt: "2026-08-10T00:10:00Z" },
        display: null,
      },
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
    const mapped = mapGenerationAssetImage({
      ...dto,
      finalNegativePrompt: null,
      publicAt: null,
      title: null,
      description: null,
    });
    expect(mapped.finalNegativePrompt).toBeNull();
    expect(mapped.publicAt).toBeNull();
    expect(mapped.title).toBeNull();
    expect(mapped.description).toBeNull();
  });
});

describe("needsImageUrlRefresh", () => {
  it("keeps a URL outside the 60-second renewal window", () => {
    expect(
      needsImageUrlRefresh(
        { url: "https://example.test", expiresAt: "2026-08-11T12:01:00.001Z" },
        Date.parse("2026-08-11T12:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it.each([0, 1, 59_999, 60_000])("renews a URL with %i milliseconds remaining", (remaining) => {
    const now = Date.parse("2026-08-11T12:00:00Z");
    const url = { url: "https://example.test", expiresAt: new Date(now + remaining).toISOString() };
    expect(needsImageUrlRefresh(url, now)).toBe(true);
    expect(isImageUrlExpired(url, now)).toBe(remaining === 0);
  });

  it("treats missing URLs as unavailable but keeps URLs without an expiry", () => {
    expect(needsImageUrlRefresh(null)).toBe(true);
    expect(isImageUrlExpired(null)).toBe(true);
    expect(needsImageUrlRefresh({ url: "https://example.test", expiresAt: null })).toBe(false);
  });

  it("refreshes an expired or malformed URL", () => {
    expect(
      needsImageUrlRefresh(
        { url: "https://example.test", expiresAt: "2026-08-11T12:00:00.000Z" },
        Date.parse("2026-08-11T12:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      needsImageUrlRefresh(
        { url: "https://example.test", expiresAt: "not-a-date" },
        Date.parse("2026-08-11T12:00:00.000Z"),
      ),
    ).toBe(true);
  });
});
