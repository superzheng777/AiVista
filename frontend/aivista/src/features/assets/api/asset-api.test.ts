import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/browser-client", () => ({
  browserApiClient: { get: vi.fn(), post: vi.fn() },
}));

import { browserApiClient } from "@/shared/api/browser-client";
import { setGenerationImageFavorites, uploadGenerationReferenceImage } from "@/features/assets/api/asset-api";

const client = vi.mocked(browserApiClient);

describe("asset-api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("将批量收藏请求写成明确的目标状态", async () => {
    client.post.mockResolvedValue({ data: { code: 0, message: "ok", data: null } } as never);

    await setGenerationImageFavorites(["101", "102"], true);

    expect(client.post).toHaveBeenCalledWith("/generation-images/favorites", {
      imageIds: ["101", "102"],
      favorite: true,
    });
  });

  it("以 multipart 形式上传图生图参考图片", async () => {
    client.post.mockResolvedValue({ data: { code: 0, message: "ok", data: { assetId: "101", expiresAt: "2026-08-28T00:00:00Z" } } } as never);
    const file = new File(["image"], "reference.png", { type: "image/png" });

    await uploadGenerationReferenceImage(file);

    expect(client.post).toHaveBeenCalledWith("/generation-images/uploads", expect.any(FormData));
    const formData = client.post.mock.calls[0]?.[1] as FormData;
    expect(formData.get("file")).toBe(file);
  });
});
