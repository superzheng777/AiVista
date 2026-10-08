import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { AssetReference } from "../../sessions/session-contract.js";
import { imageReferenceText } from "../../sessions/model-images.js";

const parameters = Type.Object({
  assetId: Type.String({
    pattern: "^[1-9]\\d*$",
    description: "当前会话中需要重新查看或质检的图片资产 ID。",
  }),
}, { additionalProperties: false });

export type InspectImageResult = { assetId: string; asset: AssetReference };

export interface InspectImageToolOptions {
  inspect: (assetId: string, signal?: AbortSignal) => Promise<InspectImageResult>;
}

type InspectImageDetails =
  | { outcome: "SUCCEEDED"; assetId: string }
  | { outcome: "FAILED"; assetId: string; code: string; message: string; retryable: boolean };

/** The request adapter resolves this persisted reference into a transient model image URL. */
export function createInspectImageTool(options: InspectImageToolOptions): ToolDefinition {
  return defineTool<typeof parameters, InspectImageDetails>({
    name: "inspect_image",
    label: "查看图片",
    description: "读取当前会话中已授权的历史图片或本轮生成结果。当前请求直接附带的输入图片无需调用。",
    parameters,
    async execute(_toolCallId, params, signal) {
      try {
        const result = await options.inspect(params.assetId, signal);
        return {
          content: [
            { type: "text" as const, text: `[已读取图片 Asset ID: ${result.assetId}]` },
            { type: "text" as const, text: imageReferenceText(result.asset) },
          ],
          details: { outcome: "SUCCEEDED", assetId: result.assetId },
        };
      } catch {
        signal?.throwIfAborted();
        const failure: InspectImageDetails = { outcome: "FAILED", assetId: params.assetId,
          code: "IMAGE_NOT_AVAILABLE", message: "图片不属于当前会话或暂时无法读取。", retryable: false };
        return {
          content: [{ type: "text" as const, text: `图片读取失败（${failure.code}）：${failure.message}` }],
          details: failure,
        };
      }
    },
  });
}
