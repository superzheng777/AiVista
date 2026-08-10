import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/browser-client", () => ({
  browserApiClient: { get: vi.fn(), post: vi.fn() },
}));

import { browserApiClient } from "@/shared/api/browser-client";
import { setGenerationImageFavorites } from "@/features/assets/api/asset-api";

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
});
