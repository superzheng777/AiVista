import { describe, expect, it, vi } from "vitest";
import { AgentGenerationToolExecutor } from "../src/agent/tools/generation-executor.js";
import { JavaGenerationApiError } from "../src/agent/adapters/java-generation-client.js";
import type { GenerationToolRequest } from "../src/agent/tools/generation.js";

describe("AgentGenerationToolExecutor", () => {
  it("creates, waits, and returns authoritative image asset IDs", async () => {
    const java = { createTask: vi.fn().mockResolvedValue({ generationTaskId: "301" }) };
    const completions = { wait: vi.fn().mockResolvedValue({ generationTaskId: "301", status: "SUCCEEDED",
      revision: 1, failureCode: null, assets: [{ assetId: "501" }] }) };
    const executor = new AgentGenerationToolExecutor({ creationId: "151",
      generationClient: java as never, completionCoordinator: completions as never });

    await expect(executor.execute("call-1", request())).resolves.toEqual({
      outcome: "SUCCEEDED", generationTaskId: "301", imageAssetIds: ["501"],
    });
    expect(java.createTask).toHaveBeenCalledWith("151", "call-1", request(), expect.any(AbortSignal));
    expect(completions.wait).toHaveBeenCalledWith("301", expect.any(AbortSignal));
  });

  it("uses the Pi toolCallId as the stable Tool invocation identity", async () => {
    const java = { createTask: vi.fn().mockResolvedValue({ generationTaskId: "301" }) };
    const completions = { wait: vi.fn().mockResolvedValue({ generationTaskId: "301", status: "FAILED",
      revision: 1, failureCode: "PROVIDER_RATE_LIMITED", assets: [] }) };
    const executor = new AgentGenerationToolExecutor({ creationId: "151",
      generationClient: java as never, completionCoordinator: completions as never });

    await executor.execute("call-1", request());
    await executor.execute("call-1", request());
    expect(java.createTask.mock.calls[0]?.[1]).toBe(java.createTask.mock.calls[1]?.[1]);
  });

  it("returns Java business errors as model-visible outcomes", async () => {
    const java = { createTask: vi.fn().mockRejectedValue(
      new JavaGenerationApiError(429, 42901, "今日生成图片额度已用尽")) };
    const executor = new AgentGenerationToolExecutor({ creationId: "151",
      generationClient: java as never, completionCoordinator: {} as never });

    await expect(executor.execute("call-quota", request())).resolves.toEqual({
      outcome: "FAILED",
      code: "JAVA_42901",
      message: "今日生成图片额度已用尽",
      retryable: false,
    });
  });

  it("turns infrastructure failures into a retryable Tool outcome", async () => {
    const java = { createTask: vi.fn().mockRejectedValue(new TypeError("network unavailable")) };
    const executor = new AgentGenerationToolExecutor({ creationId: "151",
      generationClient: java as never, completionCoordinator: {} as never });

    await expect(executor.execute("call-network", request())).resolves.toEqual({
      outcome: "FAILED",
      code: "GENERATION_SERVICE_UNAVAILABLE",
      message: "图片生成服务暂时不可用，请稍后再试。",
      retryable: true,
    });
  });
});

function request(): GenerationToolRequest {
  return { operation: "TEXT_TO_IMAGE", prompt: "海报", negativePrompt: null, aspectRatio: "3:4",
    inputAssetIds: [], promptExtend: true, imageCount: 1 };
}
