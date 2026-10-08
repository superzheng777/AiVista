import { describe, expect, it, vi } from "vitest";
import { GenerationImageUrlService } from "../src/generation/generation-image-url.service.js";

describe("generation image URL signing", () => {
  it("preserves an unsigned reference and signs model input for ten minutes", () => {
    const service = new GenerationImageUrlService({ get: (key: string) => values[key] } as never);
    const signatureUrl = vi.fn((key: string) => `signed:${key}`);
    Object.assign(service as object, { client: { signatureUrl } });

    const reference = service.unsigned("users/7/tasks/301/0/original.png");
    expect(reference).toBe("https://private.oss.example/users/7/tasks/301/0/original.png");
    expect(service.signReference(reference)).toBe("signed:users/7/tasks/301/0/original.png");
    expect(signatureUrl).toHaveBeenCalledExactlyOnceWith("users/7/tasks/301/0/original.png", { expires: 600 });
  });

  it.each([
    "https://other.oss.example/users/7/image.png",
    "http://private.oss.example/users/7/image.png",
    "https://private.oss.example/users/7/image.png?Signature=old",
    "https://user@private.oss.example/users/7/image.png",
  ])("rejects an untrusted or already signed reference: %s", (url) => {
    const service = new GenerationImageUrlService({ get: (key: string) => values[key] } as never);
    expect(() => service.signReference(url)).toThrow("outside the configured private bucket");
  });
});

const values: Record<string, unknown> = {
  AIVISTA_OSS_ENDPOINT: "https://oss.example",
  AIVISTA_OSS_BUCKET: "private",
  AIVISTA_OSS_ORIGINAL_SIGNED_URL_TTL_SECONDS: 600,
};
