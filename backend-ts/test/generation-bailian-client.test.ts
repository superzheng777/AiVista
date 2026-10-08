import { afterEach, describe, expect, it, vi } from "vitest";
import { GenerationBailianClientService } from "../src/generation/generation-bailian-client.service.js";
import { BailianProviderError, BailianTransportError } from "../src/generation/generation-provider-error.js";

afterEach(() => vi.unstubAllGlobals());

describe("generation Bailian client", () => {
  it("builds the multimodal request and validates a successful response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, successBody()));
    vi.stubGlobal("fetch", fetchMock);
    const client = createClient();
    const result = await client.generate(task(), [{ assetId: "9", url: "https://oss.example/users/7/original.png" }]);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(init.body)).toEqual({ model: "qwen-image-2.0", input: { messages: [{ role: "user", content: [
      { image: "signed:https://oss.example/users/7/original.png" }, { text: "a city" },
    ] }] }, parameters: { negative_prompt: "", size: "2048*2048", n: 1, prompt_extend: true, watermark: false } });
    expect(init.headers).toMatchObject({ authorization: "Bearer secret", "x-dashscope-wait-timeout": "30" });
    expect(result).toEqual({ requestId: "req-1", imageUrls: ["https://provider/image.png"] });
  });

  it("preserves official error fields from a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(429, { code: "Throttling", message: "slow", request_id: "req-2" })));
    await expect(createClient().generate(task())).rejects.toMatchObject({
      name: "BailianProviderError", httpStatus: 429, providerCode: "Throttling", requestId: "req-2",
    });
  });

  it.each([
    new TypeError("fetch failed"),
    new TypeError("fetch failed", { cause: Object.assign(new Error("dns"), { code: "ENOTFOUND" }) }),
  ])("does not retry a transport failure: %s", async (error) => {
    const fetchMock = vi.fn().mockRejectedValue(error);
    vi.stubGlobal("fetch", fetchMock);
    await expect(createClient().generate(task())).rejects.toMatchObject({ name: "BailianTransportError", cause: error });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a response-body failure as an unknown Provider outcome", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200, text: vi.fn().mockRejectedValue(new Error("socket closed")),
    }));
    await expect(createClient().generate(task())).rejects.toBeInstanceOf(BailianTransportError);
  });

  it("rejects malformed success responses and mismatched image counts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(200, { request_id: "req-3", output: { choices: [] }, usage: {} }))
      .mockResolvedValueOnce(response(200, successBody())));
    const client = createClient();
    await expect(client.generate(task())).rejects.toBeInstanceOf(BailianProviderError);
    await expect(client.generate({ ...task(), requested_image_count: 2 })).rejects.toMatchObject({ httpStatus: 200, providerCode: null });
  });
});

function createClient() {
  const config = { get: (key: string) => ({ AIVISTA_BAILIAN_ENDPOINT: "https://bailian.example/generate",
    AIVISTA_BAILIAN_API_KEY: "secret", AIVISTA_BAILIAN_READ_TIMEOUT_MS: 330_000 } as Record<string, unknown>)[key] };
  return new GenerationBailianClientService(config as never,
    { signReference: (url: string) => `signed:${url}` } as never);
}

function response(status: number, body: unknown) { return new Response(JSON.stringify(body), { status }); }
function successBody() { return { request_id: "req-1", output: { choices: [{ finish_reason: "stop", message: { content: [
  { image: "https://provider/image.png" }, { text: "ignored" },
] } }] }, usage: { output_image_count: 1, output_width: 2048, output_height: 2048 } }; }
function task() { return { id: "1", user_id: "7", session_id: "2", parent_id: "3", operation: "TEXT_TO_IMAGE",
 model: "bailian/qwen-image-2.0", status: "RUNNING", revision: 1, final_prompt: "a city", final_negative_prompt: null,
 width: 2048, height: 2048, prompt_extend: true, requested_image_count: 1 }; }
