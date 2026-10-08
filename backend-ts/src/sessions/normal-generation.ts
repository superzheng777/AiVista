import type { SessionManager } from "@earendil-works/pi-coding-agent";
import { generationToolResult, type GenerationToolRequest } from "../agent/tools/generation.js";
import type { CreationStart, GenerationResult } from "./session-contract.js";

/** A program-orchestrated tool call; this path never creates an AgentSession or calls an LLM. */
export async function runNormalGeneration(manager: SessionManager, start: CreationStart,
    generate: (toolCallId: string, request: GenerationToolRequest) => Promise<GenerationResult>): Promise<GenerationResult> {
  const toolCallId = `normal-${start.creationId}`;
  const toolName = start.input.assets.length ? "image_to_image" : "text_to_image";
  const request: GenerationToolRequest = {
    operation: start.input.assets.length ? "IMAGE_TO_IMAGE" : "TEXT_TO_IMAGE",
    prompt: start.input.prompt, negativePrompt: start.settings.negativePrompt ?? null,
    aspectRatio: start.settings.aspectRatio!, imageCount: start.settings.imageCount!,
    inputAssetIds: start.input.assets.map((asset) => asset.assetId), promptExtend: start.settings.promptExtend ?? true,
  };
  manager.appendMessage({ role: "user", content: start.input.prompt, timestamp: Date.now() });
  manager.appendMessage({ role: "assistant", content: [{ type: "toolCall", id: toolCallId, name: toolName,
    arguments: { prompt: request.prompt, aspectRatio: request.aspectRatio, imageCount: request.imageCount,
      promptExtend: request.promptExtend,
      ...(request.negativePrompt !== null ? { negativePrompt: request.negativePrompt } : {}),
      ...(request.inputAssetIds.length ? { inputAssetIds: request.inputAssetIds } : {}) } }],
    api: "openai-completions", provider: "aivista", model: "programmatic-generation",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "toolUse", timestamp: Date.now() });
  const appendResult = (result: GenerationResult) => manager.appendMessage({ role: "toolResult",
    toolCallId, toolName, ...generationToolResult(result), isError: result.status === "FAILED", timestamp: Date.now() });
  let result: GenerationResult;
  try {
    result = await generate(toolCallId, request);
  } catch (error) {
    appendResult({ generationId: null, status: "FAILED", assets: [], code: "GENERATION_FAILED",
      message: "生成执行未完成。", retryable: false });
    throw error;
  }
  appendResult(result);
  return result;
}
