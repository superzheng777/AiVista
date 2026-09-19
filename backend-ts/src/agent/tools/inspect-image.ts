import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { ImageContent } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { JavaGenerationApiError } from "../adapters/java-generation-client.js";

const parameters = Type.Object({
  assetId: Type.String({
    pattern: "^[1-9]\\d*$",
    description: "对话历史中需要重新查看的图片资产 ID。",
  }),
}, { additionalProperties: false });

export interface InspectImageResult {
  assetId: string;
  image: ImageContent;
}

export interface InspectImageToolOptions {
  inspect: (assetId: string, signal?: AbortSignal) => Promise<InspectImageResult>;
}

type InspectImageDetails =
  | { outcome: "SUCCEEDED"; assetId: string }
  | { outcome: "FAILED"; assetId: string; code: string; message: string; retryable: boolean };

/** Restores one authorized historical Asset ID as model-visible Pi ImageContent. */
export function createInspectImageTool(options: InspectImageToolOptions): ToolDefinition {
  return defineTool<typeof parameters, InspectImageDetails>({
    name: "inspect_image",
    label: "查看图片",
    description: "读取当前会话历史中仅以 Asset ID 保留的图片内容。当前请求已直接附带图片时无需调用。",
    parameters,
    async execute(_toolCallId, params, signal) {
      try {
        const result = await options.inspect(params.assetId, signal);
        return {
          content: [
            { type: "text" as const, text: `[已读取图片 Asset ID: ${result.assetId}]` },
            result.image,
          ],
          details: { outcome: "SUCCEEDED", assetId: result.assetId },
        };
      } catch (error) {
        signal?.throwIfAborted();
        const failure = imageFailure(params.assetId, error);
        return {
          content: [{ type: "text" as const, text: `图片读取失败（${failure.code}）：${failure.message}` }],
          details: failure,
        };
      }
    },
  });
}

function imageFailure(assetId: string, error: unknown): Extract<InspectImageDetails, { outcome: "FAILED" }> {
  if (error instanceof JavaGenerationApiError) {
    if (error.code === 40301 || error.code === 40401) {
      return { outcome: "FAILED", assetId, code: "IMAGE_NOT_AVAILABLE",
        message: "该图片不属于当前会话、已删除或已失效，请选择其他图片。", retryable: true };
    }
    if (error.code === 40907) {
      return { outcome: "FAILED", assetId, code: "AGENT_CREATION_NOT_RUNNING",
        message: "当前创作已经结束，不能继续读取图片。", retryable: false };
    }
  }
  return { outcome: "FAILED", assetId, code: "IMAGE_READ_FAILED",
    message: "图片暂时无法读取，请稍后重试或选择其他图片。", retryable: true };
}
