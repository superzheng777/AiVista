import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import { downloadPublicDisplayImage } from "@/features/inspiration/lib/public-image-download";

const image: GenerationAsset = {
  id: "image-1",
  sourceIndex: 0,
  imageUrls: {
    thumbnail: null,
    display: { url: "https://cdn.example/display.webp", expiresAt: "2099-01-01T00:00:00Z" },
  },
  width: 1024,
  height: 1024,
  createdAt: "2026-06-21T00:00:00Z",
  favorited: false,
  finalPrompt: "prompt",
  finalNegativePrompt: null,
  requestedImageCount: 1,
  promptExtend: true,
  publicationReviewStatus: "APPROVED",
  publicationVersion: 1,
  publicAt: "2026-06-22T03:00:00Z",
  title: "作品",
  description: null,
  authorId: "12",
  likeCount: 0,
  likedByCurrentUser: false,
};

const okResponse = () => ({ ok: true, blob: vi.fn().mockResolvedValue(new Blob(["image"])) }) as unknown as Response;
const failedResponse = () => ({ ok: false, blob: vi.fn() }) as unknown as Response;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:download"),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

describe("downloadPublicDisplayImage", () => {
  it("downloads an unexpired public display rendition without refreshing", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okResponse());
    const refresh = vi.fn();

    await downloadPublicDisplayImage(image, refresh);

    expect(fetch).toHaveBeenCalledWith(image.imageUrls.display?.url, { mode: "cors", referrerPolicy: "no-referrer" });
    expect(refresh).not.toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:download");
  });

  it("refreshes an expired display URL before downloading", async () => {
    const expired = {
      ...image,
      imageUrls: { ...image.imageUrls, display: { ...image.imageUrls.display!, expiresAt: "2000-01-01T00:00:00Z" } },
    };
    const refreshed = {
      ...image,
      imageUrls: {
        ...image.imageUrls,
        display: { url: "https://cdn.example/refreshed.webp", expiresAt: "2099-01-01T00:00:00Z" },
      },
    };
    const refresh = vi.fn().mockResolvedValue(refreshed);
    vi.mocked(fetch).mockResolvedValueOnce(okResponse());

    await downloadPublicDisplayImage(expired, refresh);

    expect(refresh).toHaveBeenCalledWith(image.id);
    expect(fetch).toHaveBeenCalledWith(refreshed.imageUrls.display?.url, {
      mode: "cors",
      referrerPolicy: "no-referrer",
    });
  });

  it("refreshes once when the current display URL fails", async () => {
    const refreshed = {
      ...image,
      imageUrls: {
        ...image.imageUrls,
        display: { url: "https://cdn.example/retry.webp", expiresAt: "2099-01-01T00:00:00Z" },
      },
    };
    const refresh = vi.fn().mockResolvedValue(refreshed);
    vi.mocked(fetch).mockResolvedValueOnce(failedResponse()).mockResolvedValueOnce(okResponse());

    await downloadPublicDisplayImage(image, refresh);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
