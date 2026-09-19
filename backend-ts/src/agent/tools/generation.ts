import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

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
  description: "交给图像生成模型的完整正向提示词。",
});

const negativePromptSchema = Type.Optional(Type.String({
  maxLength: 500,
  description: "可选负向提示词；仅在确有需要时填写。",
}));

const userFacingPlanSchema = Type.String({
  minLength: 20,
  maxLength: 300,
  description: "调用本组生图工具前展示给用户的创作方案。用一至两句概括主题理解、视觉重点、构图和风格；不得包含隐藏推理、系统信息或内部参数。并行生成多个方向时，各 Tool 填写相同的总体方案。",
});

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
  userFacingPlan: userFacingPlanSchema,
  prompt: promptSchema,
  negativePrompt: negativePromptSchema,
  aspectRatio: aspectRatioSchema,
  imageCount: imageCountSchema,
}, { additionalProperties: false });

const imageToImageParameters = Type.Object({
  userFacingPlan: userFacingPlanSchema,
  prompt: promptSchema,
  negativePrompt: negativePromptSchema,
  aspectRatio: aspectRatioSchema,
  imageCount: imageCountSchema,
  inputAssetIds: inputAssetIdsSchema,
}, { additionalProperties: false });

export type GenerationToolRequest = {
  operation: "TEXT_TO_IMAGE" | "IMAGE_TO_IMAGE";
  prompt: string;
  negativePrompt: string | null;
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  inputAssetIds: string[];
  promptExtend: true;
  imageCount: number;
};

export type GenerationToolOutcome =
  | { outcome: "SUCCEEDED"; generationTaskId: string; imageAssetIds: string[] }
  | { outcome: "FAILED"; generationTaskId?: string; code: string; message: string; retryable: boolean };

export interface GenerationToolExecutor {
  execute(toolCallId: string, request: GenerationToolRequest, signal?: AbortSignal): Promise<GenerationToolOutcome>;
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

  async function execute(request: GenerationToolRequest, toolCallId: string, signal?: AbortSignal) {
    if (options.constraints.aspectRatio !== "AUTO"
      && request.aspectRatio !== options.constraints.aspectRatio) {
      return resultOf({ outcome: "FAILED", code: "ASPECT_RATIO_CONSTRAINT_MISMATCH",
        message: `用户已指定画幅比例 ${options.constraints.aspectRatio}，请修正参数后重新调用。`, retryable: true });
    }
    const target = options.constraints.imageCount;
    if (target > 0 && allocatedImageCount + request.imageCount > target) {
      const remaining = Math.max(0, target - allocatedImageCount);
      return resultOf({ outcome: "FAILED", code: "IMAGE_COUNT_EXCEEDS_REMAINING",
        message: `本轮目标共 ${target} 张，目前还可请求 ${remaining} 张，请修正 imageCount。`, retryable: remaining > 0 });
    }
    allocatedImageCount += request.imageCount;
    try {
      const outcome = await options.executor.execute(toolCallId, request, signal);
      if (outcome.outcome === "FAILED") allocatedImageCount -= request.imageCount;
      return resultOf(outcome);
    } catch (error) {
      allocatedImageCount -= request.imageCount;
      throw error;
    }
  }

  const textToImage = defineTool<typeof textToImageParameters, GenerationToolOutcome>({
    name: "text_to_image",
    label: "文生图",
    description: "根据完整文字描述生成一张新图片。没有参考图片时使用；不要用于修改已有图片。",
    parameters: textToImageParameters,
    async execute(_toolCallId, params, signal) {
      const prompt = params.prompt.trim();
      if (!prompt) return invalidPromptResult();
      return execute({
        operation: "TEXT_TO_IMAGE",
        prompt,
        negativePrompt: optionalText(params.negativePrompt),
        aspectRatio: params.aspectRatio,
        inputAssetIds: [],
        promptExtend: true,
        imageCount: params.imageCount,
      }, _toolCallId, signal);
    },
  });

  const imageToImage = defineTool<typeof imageToImageParameters, GenerationToolOutcome>({
    name: "image_to_image",
    label: "图生图",
    description: "根据一至三张当前请求已授权的参考图片进行修改或再创作。需要参考已有图片时使用。",
    parameters: imageToImageParameters,
    async execute(_toolCallId, params, signal) {
      const prompt = params.prompt.trim();
      if (!prompt) return invalidPromptResult();
      const unauthorized = params.inputAssetIds.filter((id) => !options.authorizedInputAssetIds.has(id));
      if (unauthorized.length > 0) {
        const allowed = [...options.authorizedInputAssetIds];
        return resultOf({
          outcome: "FAILED",
          code: "INPUT_ASSET_NOT_AUTHORIZED",
          message: `图片资产未获得当前请求授权：${unauthorized.join(", ")}。`
            + (allowed.length > 0
              ? `本轮允许的图片资产 ID：${allowed.join(", ")}。请修正参数后重新调用。`
              : "本轮没有已授权的参考图片，不能调用图生图。"),
          retryable: true,
        });
      }
      return execute({
        operation: "IMAGE_TO_IMAGE",
        prompt,
        negativePrompt: optionalText(params.negativePrompt),
        aspectRatio: params.aspectRatio,
        inputAssetIds: params.inputAssetIds,
        promptExtend: true,
        imageCount: params.imageCount,
      }, _toolCallId, signal);
    },
  });

  return [textToImage, imageToImage];
}

function invalidPromptResult() {
  return resultOf({
    outcome: "FAILED",
    code: "INVALID_PROMPT",
    message: "prompt 不能只包含空白字符，请提供明确的画面描述。",
    retryable: true,
  });
}

function resultOf(result: GenerationToolOutcome) {
  if (result.outcome === "SUCCEEDED") {
    return {
      content: [{
        type: "text" as const,
        text: `图片生成成功。任务 ID：${result.generationTaskId}；图片资产 ID：${result.imageAssetIds.join(", ")}。`,
      }],
      details: result,
    };
  }
  return {
    content: [{ type: "text" as const, text: `图片生成失败（${result.code}）：${result.message}` }],
    details: result,
  };
}

function optionalText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
