import { describe, expect, it, vi } from "vitest";
import { GenerationImageUrlService } from "../src/generation/generation-image-url.service.js";

describe("generation image URL signing", () => {
  it("uses one day for preview images and ten minutes for originals", () => {
    const service = new GenerationImageUrlService({ get: (key: string) => values[key] } as never);
    const signatureUrl = vi.fn((key: string) => `signed:${key}`);
    Object.assign(service as object, { client: { signatureUrl } });

    service.urls("users/7/tasks/301/0");
    service.original("users/7/tasks/301/0/original.png");

    expect(signatureUrl).toHaveBeenNthCalledWith(1, "users/7/tasks/301/0/card.webp", { expires: 86400 });
    expect(signatureUrl).toHaveBeenNthCalledWith(2, "users/7/tasks/301/0/display.webp", { expires: 86400 });
    expect(signatureUrl).toHaveBeenNthCalledWith(3, "users/7/tasks/301/0/original.png", { expires: 600 });
  });
});

const values: Record<string, unknown> = {
  AIVISTA_OSS_SIGNED_URL_TTL_SECONDS: 86400,
  AIVISTA_OSS_ORIGINAL_SIGNED_URL_TTL_SECONDS: 600,
};
