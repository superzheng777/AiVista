import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JavaGenerationApiError, JavaGenerationClient } from "../src/agent/adapters/java-generation-client.js";
import type { Environment } from "../src/config/environment.js";
import type { GenerationToolRequest } from "../src/agent/tools/index.js";

afterEach(() => vi.unstubAllGlobals());

describe("JavaGenerationClient", () => {
  it("creates an Agent child generation task with its toolCallId", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      generationTaskId: "301", sessionId: "101", status: "QUEUED", revision: 0,
      requestedImageCount: 1, createdAt: "2026-09-09T02:00:00Z",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new JavaGenerationClient(config());

    const result = await client.createTask("151", "call-1", request());

    expect(result.generationTaskId).toBe("301");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://java/api/internal/generation-worker/agent-creations/151/generation-tasks/call-1",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "X-AiVista-Worker-Token": "worker-secret",
        }),
      }),
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual(request());
  });

  it("preserves Java business code and safe message for Tool error mapping", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 42901, message: "今日生成图片额度已用尽", data: null,
    }), { status: 429, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new JavaGenerationClient(config());

    const error = await client.createTask("151", "b719c741-8607-4b0f-9a72-2dcbfdd6b6ee", request())
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(JavaGenerationApiError);
    expect(error).toMatchObject({ status: 429, code: 42901, message: "今日生成图片额度已用尽" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a transient Java failure with the same toolCallId", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        generationTaskId: "301", sessionId: "101", status: "QUEUED", revision: 0,
        requestedImageCount: 1, createdAt: "2026-09-09T02:00:00Z",
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new JavaGenerationClient(config()).createTask("151", "call-1", request()))
      .resolves.toMatchObject({ generationTaskId: "301" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "http://java/api/internal/generation-worker/agent-creations/151/generation-tasks/call-1",
      "http://java/api/internal/generation-worker/agent-creations/151/generation-tasks/call-1",
    ]);
  });

  it("accepts the existing child task after a lost create response has already progressed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      generationTaskId: "301", sessionId: "101", status: "GENERATING", revision: 1,
      requestedImageCount: 1, createdAt: "2026-09-09T02:00:00Z",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new JavaGenerationClient(config()).createTask("151", "call-1", request()))
      .resolves.toMatchObject({ generationTaskId: "301", status: "GENERATING", revision: 1 });
  });

  it("loads and validates the minimal Agent execution snapshot", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      contractVersion: 2, creationId: "151", revision: 0, status: "RUNNING", sessionId: "101",
      prompt: "把这张图改成海报", agentContext: { schemaVersion: 1, compaction: null,
        messages: [{ role: "user", content: "上一轮", timestamp: 1 }] },
      inputAssets: [{ assetId: "501", objectKey: "users/7/x/display.webp",
        contentType: "image/webp", fileSize: 1234, width: 800, height: 1200 }],
      constraints: { aspectRatio: "3:4", imageCount: 3 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new JavaGenerationClient(config());

    const result = await client.getAgentExecution("151");

    expect(result.inputAssets[0]?.contentType).toBe("image/webp");
    expect(result.agentContext?.messages).toEqual([{ role: "user", content: "上一轮", timestamp: 1 }]);
    expect(result.constraints).toEqual({ aspectRatio: "3:4", imageCount: 3 });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://java/api/internal/generation-worker/agent-creations/151/execution",
      expect.objectContaining({ headers: { "X-AiVista-Worker-Token": "worker-secret" } }),
    );
  });

  it("resolves one authorized historical image for the active Agent revision", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      assetId: "501", objectKey: "users/7/tasks/20/0/display.webp", contentType: "image/webp",
      fileSize: 1234, width: 800, height: 1200,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new JavaGenerationClient(config()).resolveAgentImage("151", 3, "501");

    expect(result).toMatchObject({ assetId: "501", contentType: "image/webp" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://java/api/internal/generation-worker/agent-creations/151/assets/501?expectedRevision=3",
      expect.objectContaining({ headers: { "X-AiVista-Worker-Token": "worker-secret" } }),
    );
  });

  it("does not call Java without the configured worker credential", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const values = { ...baseValues(), AIVISTA_GENERATION_WORKER_TOKEN: undefined } as Environment;
    const client = new JavaGenerationClient(new ConfigService<Environment, true>(values));

    await expect(client.createTask("151", "b719c741-8607-4b0f-9a72-2dcbfdd6b6ee", request()))
      .rejects.toThrow("token is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function request(): GenerationToolRequest {
  return {
    operation: "TEXT_TO_IMAGE", prompt: "夏日饮品海报", negativePrompt: null,
    aspectRatio: "3:4", inputAssetIds: [], promptExtend: true, imageCount: 1,
  };
}

function config(): ConfigService<Environment, true> {
  return new ConfigService<Environment, true>(baseValues() as Environment);
}

function baseValues() {
  return { AIVISTA_JAVA_BASE_URL: "http://java/api", AIVISTA_GENERATION_WORKER_TOKEN: "worker-secret",
    AIVISTA_JAVA_REQUEST_TIMEOUT_MS: 10_000 };
}
