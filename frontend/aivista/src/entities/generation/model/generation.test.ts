import { describe, expect, it } from "vitest";

import { mapGenerationAssetImage, type GenerationAssetImageDto } from "@/entities/generation/model/generation";

const dto: GenerationAssetImageDto = {
  imageId: "img-1",
  url: "https://signed.example/img-1",
  urlExpiresAt: "2026-08-10T00:10:00Z",
  createdAt: "2026-08-09T00:00:00Z",
  finalPrompt: "一只戴帽子的猫",
  finalNegativePrompt: "模糊",
  generationConfig: { width: 1024, height: 768, requestedImageCount: 4, promptExtend: true },
  publicationReviewStatus: "PENDING",
  publicationVersion: 2,
  publicAt: null,
  title: "我的作品",
  description: "描述文本",
};

describe("mapGenerationAssetImage", () => {
  it("把完整图片 DTO 展开到资产领域模型", () => {
    expect(mapGenerationAssetImage(dto)).toEqual({
      id: "img-1",
      url: "https://signed.example/img-1",
      urlExpiresAt: "2026-08-10T00:10:00Z",
      createdAt: "2026-08-09T00:00:00Z",
      finalPrompt: "一只戴帽子的猫",
      finalNegativePrompt: "模糊",
      width: 1024,
      height: 768,
      requestedImageCount: 4,
      promptExtend: true,
      publicationReviewStatus: "PENDING",
      publicationVersion: 2,
      publicAt: null,
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
