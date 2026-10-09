import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { GenerationResult } from "../../sessions/session-contract.js";

const aspectRatioSchema = Type.Union([
  Type.Literal("1:1"),
  Type.Literal("16:9"),
  Type.Literal("9:16"),
  Type.Literal("4:3"),
  Type.Literal("3:4"),
], { description: "生成图片的画幅比例。" });

const promptSchema = Type.String({
  minLength: 1,
  maxLength: 1000,
  description: "交给图像生成模型的完整正向提示词。默认使用用户当前语言，并保留用户指定的主体、数量、关系、准确文字和关键物件。",
});

const negativePromptSchema = Type.Optional(Type.String({
  maxLength: 500,
  description: "可选负向提示词；仅在确有需要时填写，并默认使用用户当前语言。",
}));

const inputAssetIdsSchema = Type.Array(
  Type.String({ pattern: "^[1-9]\\d*$", description: "当前请求已授权的图片资产 ID。" }),
  { minItems: 1, maxItems: 3, uniqueItems: true },
);

const imageCountSchema = Type.Integer({
  minimum: 1,
  maximum: 6,
  description: "本次 Tool 调用生成的图片数量。同一方向可一次生成多张；不同方向可拆成多次调用。",
});

const textToImageParameters = Type.Object({
  prompt: promptSchema,
  negativePrompt: negativePromptSchema,
  aspectRatio: aspectRatioSchema,
  imageCount: imageCountSchema,
  promptExtend: Type.Optional(Type.Boolean({ description: "是否启用图像模型的提示词扩展，默认 true。" })),
}, { additionalProperties: false });

const imageToImageParameters = Type.Object({
  prompt: promptSchema,
  negativePrompt: negativePromptSchema,
  aspectRatio: aspectRatioSchema,
  imageCount: imageCountSchema,
  promptExtend: Type.Optional(Type.Boolean({ description: "是否启用图像模型的提示词扩展，默认 true。" })),
  inputAssetIds: inputAssetIdsSchema,
}, { additionalProperties: false });

export type GenerationToolRequest = {
  operation: "TEXT_TO_IMAGE" | "IMAGE_TO_IMAGE";
  prompt: string;
  negativePrompt: string | null;
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  inputAssetIds: string[];
  promptExtend: boolean;
  imageCount: number;
};

export interface GenerationToolExecutor {
  execute(toolCallId: string, request: GenerationToolRequest, signal?: AbortSignal): Promise<GenerationResult>;
}

export interface GenerationToolOptions {
  executor: GenerationToolExecutor;
  authorizedInputAssetIds: ReadonlySet<string>;
  constraints: AgentGenerationConstraints;
}

export type AgentGenerationConstraints = {
  aspectRatio: "AUTO" | GenerationToolRequest["aspectRatio"];
  imageCount: number;
};

export function createGenerationTools(options: GenerationToolOptions): ToolDefinition[] {
  let allocatedImageCount = 0;

  async function executeGeneration(request: GenerationToolRequest, toolCallId: string, signal?: AbortSignal) {
    if (options.constraints.aspectRatio !== "AUTO"
      && request.aspectRatio !== options.constraints.aspectRatio) {
      return generationToolResult({ status: "FAILED", generationId: null, assets: [], code: "ASPECT_RATIO_CONSTRAINT_MISMATCH",
        message: `用户已指定画幅比例 ${options.constraints.aspectRatio}，请修正参数后重新调用。`, retryable: true });
    }
    const target = options.constraints.imageCount;
    if (target > 0 && allocatedImageCount + request.imageCount > target) {
      const remaining = Math.max(0, target - allocatedImageCount);
      return generationToolResult({ status: "FAILED", generationId: null, assets: [], code: "IMAGE_COUNT_EXCEEDS_REMAINING",
        message: `本轮目标共 ${target} 张，目前还可请求 ${remaining} 张，请修正 imageCount。`, retryable: remaining > 0 });
    }
    allocatedImageCount += request.imageCount;
    try {
      const outcome = await options.executor.execute(toolCallId, request, signal);
      if (outcome.status === "FAILED") {
        allocatedImageCount -= request.imageCount;
      } else {
        allocatedImageCount += outcome.assets.length - request.imageCount;
      }
      return generationToolResult(outcome);
    } catch (error) {
      allocatedImageCount -= request.imageCount;
      throw error;
    }
  }

  const textToImage = defineTool<typeof textToImageParameters, GenerationResult>({
    name: "text_to_image",
    label: "文生图",
    description: "根据完整文字描述生成一张新图片。没有参考图片时使用；不要用于修改已有图片。",
    parameters: textToImageParameters,
    async execute(toolCallId, params, signal) {
      const prompt = params.prompt.trim();
      if (!prompt) return invalidPromptResult();
      return executeGeneration({
        operation: "TEXT_TO_IMAGE",
        prompt,
        negativePrompt: optionalText(params.negativePrompt),
        aspectRatio: params.aspectRatio,
        inputAssetIds: [],
        promptExtend: params.promptExtend ?? true,
        imageCount: params.imageCount,
      }, toolCallId, signal);
    },
  });

  const imageToImage = defineTool<typeof imageToImageParameters, GenerationResult>({
    name: "image_to_image",
    label: "图生图",
    description: "根据一至三张当前请求已授权的参考图片进行修改或再创作。需要参考已有图片时使用。",
    parameters: imageToImageParameters,
    async execute(toolCallId, params, signal) {
      const prompt = params.prompt.trim();
      if (!prompt) return invalidPromptResult();
      const unauthorized = params.inputAssetIds.filter((id) => !options.authorizedInputAssetIds.has(id));
      if (unauthorized.length > 0) {
        const allowed = [...options.authorizedInputAssetIds];
        return generationToolResult({
          status: "FAILED", generationId: null, assets: [],
          code: "INPUT_ASSET_NOT_AUTHORIZED",
          message: `图片资产未获得当前请求授权：${unauthorized.join(", ")}。`
            + (allowed.length > 0
              ? `本轮允许的图片资产 ID：${allowed.join(", ")}。请修正参数后重新调用。`
              : "本轮没有已授权的参考图片，不能调用图生图。"),
          retryable: true,
        });
      }
      return executeGeneration({
        operation: "IMAGE_TO_IMAGE",
        prompt,
        negativePrompt: optionalText(params.negativePrompt),
        aspectRatio: params.aspectRatio,
        inputAssetIds: params.inputAssetIds,
        promptExtend: params.promptExtend ?? true,
        imageCount: params.imageCount,
      }, toolCallId, signal);
    },
  });

  return [textToImage, imageToImage];
}

function invalidPromptResult() {
  return generationToolResult({
    status: "FAILED", generationId: null, assets: [],
    code: "INVALID_PROMPT",
    message: "prompt 不能只包含空白字符，请提供明确的画面描述。",
    retryable: true,
  });
}

/** The same result supplies model text and the persisted UI projection. */
export function generationToolResult(result: GenerationResult) {
  const text = result.status === "FAILED"
    ? `图片生成失败（${result.code ?? "GENERATION_FAILED"}）：${result.message ?? "本次未交付的图片不会扣除额度。"}`
    : `图片生成${result.status === "PARTIALLY_SUCCEEDED" ? "部分成功" : "成功"}。任务 ID：${result.generationId}；已交付 ${result.assets.length} 张，图片资产 ID：${result.assets.map((asset) => asset.assetId).join(", ")}。`;
  return { content: [{ type: "text" as const, text }], details: result };
}

function optionalText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
