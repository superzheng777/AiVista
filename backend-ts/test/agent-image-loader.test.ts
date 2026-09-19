import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentImageLoaderService } from "../src/agent/agent-image-loader.service.js";

afterEach(() => vi.unstubAllGlobals());

describe("AgentImageLoaderService", () => {
  it("loads ordered private objects as Pi ImageContent", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(Buffer.from([1, 2])))
      .mockResolvedValueOnce(new Response(Buffer.from([3]))));
    const service = createService();

    const images = await service.load([
      input("501", "users/7/a/display.webp", "image/webp"),
      input("502", "users/7/b/original.jpg", "image/jpeg"),
    ]);

    expect(images).toEqual([
      { type: "image", data: "AQI=", mimeType: "image/webp" },
      { type: "image", data: "Aw==", mimeType: "image/jpeg" },
    ]);
  });

  it("does not require OSS configuration for a text-only prompt", async () => {
    const service = new AgentImageLoaderService({ get: vi.fn() } as never);
    await expect(service.load([])).resolves.toEqual([]);
  });

  it("loads one inspected historical image", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(Buffer.from([4, 5]))));
    const service = createService();

    await expect(service.loadOne(input("701", "users/7/history/display.webp", "image/webp")))
      .resolves.toEqual({ type: "image", data: "BAU=", mimeType: "image/webp" });
  });

  it("stops waiting for OSS when the Agent is cancelled", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    })));
    const service = createService();
    const abort = new AbortController();

    const loading = service.loadOne(input("701", "users/7/history/display.webp", "image/webp"), abort.signal);
    abort.abort("USER_CANCELLED");

    await expect(loading).rejects.toBe("USER_CANCELLED");
  });
});

function createService() {
  const config = { get: (key: string) => ({ AIVISTA_OSS_ENDPOINT: "oss.example", AIVISTA_OSS_BUCKET: "private",
    AIVISTA_OSS_ACCESS_KEY_ID: "id", AIVISTA_OSS_ACCESS_KEY_SECRET: "secret" })[key] };
  const service = new AgentImageLoaderService(config as never);
  Object.assign(service as object, { client: { signatureUrl: (key: string) => `https://oss.example/${key}` } });
  return service;
}

function input(assetId: string, objectKey: string, contentType: "image/webp" | "image/jpeg") {
  return { assetId, objectKey, contentType, fileSize: 100, width: 800, height: 1200 };
}
