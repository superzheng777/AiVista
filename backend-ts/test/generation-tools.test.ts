import { describe, expect, it, vi } from "vitest";
import { Value } from "typebox/value";
import {
  createGenerationTools,
  type GenerationToolExecutor,
  type GenerationToolRequest,
} from "../src/agent/tools/index.js";

describe("Agent generation tools", () => {
  it("defines strict and distinct text-to-image and image-to-image schemas", () => {
    const [textToImage, imageToImage] = createGenerationTools({
      executor: executorOf(),
      authorizedInputAssetIds: new Set(["101"]),
      constraints: { aspectRatio: "AUTO", imageCount: 0 },
    });

    expect(textToImage?.name).toBe("text_to_image");
    expect(imageToImage?.name).toBe("image_to_image");
    expect(textToImage?.parameters).toMatchObject({
      properties: {
        prompt: { description: expect.stringContaining("默认使用用户当前语言") },
        negativePrompt: { description: expect.stringContaining("默认使用用户当前语言") },
      },
    });
    expect(Value.Check(textToImage!.parameters, {
      userFacingPlan: "我会采用清晰的视觉层级完成这一版海报设计并突出画面主体。",
      prompt: "海边日落",
      aspectRatio: "16:9",
      imageCount: 2,
    })).toBe(true);
    expect(Value.Check(textToImage!.parameters, {
      userFacingPlan: "我会采用清晰的视觉层级完成这一版海报设计并突出画面主体。",
      prompt: "海边日落",
      aspectRatio: "2:1",
      imageCount: 2,
    })).toBe(false);
    expect(Value.Check(imageToImage!.parameters, {
      userFacingPlan: "我会延续参考图片的核心构图并完成这一版视觉调整。",
      prompt: "改成夜景",
      aspectRatio: "1:1",
      imageCount: 2,
      inputAssetIds: ["101", "102", "103", "104"],
    })).toBe(false);
  });

  it("normalizes fixed Agent generation parameters before execution", async () => {
    const execute = vi.fn(async (_toolCallId: string, _request: GenerationToolRequest) => ({
      outcome: "SUCCEEDED" as const,
      generationTaskId: "9001",
      imageAssetIds: ["7001"],
    }));
    const [textToImage] = createGenerationTools({
      executor: { execute },
      authorizedInputAssetIds: new Set(),
      constraints: { aspectRatio: "AUTO", imageCount: 0 },
    });

    const result = await textToImage!.execute("call-1", {
      prompt: "  极简海报  ",
      negativePrompt: "  模糊  ",
      aspectRatio: "3:4",
      imageCount: 3,
    }, undefined, undefined, {} as never);

    expect(execute).toHaveBeenCalledWith("call-1", {
      operation: "TEXT_TO_IMAGE",
      prompt: "极简海报",
      negativePrompt: "模糊",
      aspectRatio: "3:4",
      inputAssetIds: [],
      promptExtend: true,
      imageCount: 3,
    }, undefined);
    expect(result.details).toMatchObject({ outcome: "SUCCEEDED", generationTaskId: "9001" });
  });

  it("returns an actionable Tool Result without executing an unauthorized image", async () => {
    const execute = vi.fn();
    const [, imageToImage] = createGenerationTools({
      executor: { execute },
      authorizedInputAssetIds: new Set(["101"]),
      constraints: { aspectRatio: "AUTO", imageCount: 0 },
    });

    const result = await imageToImage!.execute("call-2", {
      prompt: "改成蓝色",
      aspectRatio: "1:1",
      imageCount: 1,
      inputAssetIds: ["999"],
    }, undefined, undefined, {} as never);

    expect(execute).not.toHaveBeenCalled();
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringMatching(/999.*101.*重新调用/),
    });
    expect(result.details).toMatchObject({
      outcome: "FAILED",
      code: "INPUT_ASSET_NOT_AUTHORIZED",
      retryable: true,
    });
  });

  it("returns model-visible errors when a Tool call violates Creation constraints", async () => {
    const execute = vi.fn();
    const [textToImage] = createGenerationTools({
      executor: { execute },
      authorizedInputAssetIds: new Set(),
      constraints: { aspectRatio: "3:4", imageCount: 2 },
    });

    const wrongRatio = await textToImage!.execute("call-ratio", {
      userFacingPlan: "我会按用户要求完成指定比例的海报方案并保持视觉重点清晰。",
      prompt: "公益海报", aspectRatio: "1:1", imageCount: 1,
    }, undefined, undefined, {} as never);
    expect(wrongRatio.details).toMatchObject({ code: "ASPECT_RATIO_CONSTRAINT_MISMATCH" });

    const tooMany = await textToImage!.execute("call-count", {
      userFacingPlan: "我会按用户要求完成指定数量的海报方案并保持视觉重点清晰。",
      prompt: "公益海报", aspectRatio: "3:4", imageCount: 3,
    }, undefined, undefined, {} as never);
    expect(tooMany.details).toMatchObject({ code: "IMAGE_COUNT_EXCEEDS_REMAINING" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("releases the missing image count after a partially successful generation", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ outcome: "SUCCEEDED" as const, generationTaskId: "9001",
        imageAssetIds: ["7001"] })
      .mockResolvedValueOnce({ outcome: "SUCCEEDED" as const, generationTaskId: "9002",
        imageAssetIds: ["7002", "7003"] });
    const [textToImage] = createGenerationTools({
      executor: { execute },
      authorizedInputAssetIds: new Set(),
      constraints: { aspectRatio: "AUTO", imageCount: 3 },
    });
    const parameters = {
      userFacingPlan: "我会先生成完整方向，并在部分成功时继续补足用户要求的最终数量。",
      prompt: "公益海报",
      aspectRatio: "3:4" as const,
    };

    const partial = await textToImage!.execute("call-partial", {
      ...parameters,
      imageCount: 3,
    }, undefined, undefined, {} as never);
    const remainder = await textToImage!.execute("call-remainder", {
      ...parameters,
      imageCount: 2,
    }, undefined, undefined, {} as never);
    const excess = await textToImage!.execute("call-excess", {
      ...parameters,
      imageCount: 1,
    }, undefined, undefined, {} as never);

    expect(partial.details).toMatchObject({ outcome: "SUCCEEDED", imageAssetIds: ["7001"] });
    expect(remainder.details).toMatchObject({ outcome: "SUCCEEDED", imageAssetIds: ["7002", "7003"] });
    expect(excess.details).toMatchObject({ outcome: "FAILED", code: "IMAGE_COUNT_EXCEEDS_REMAINING" });
    expect(execute).toHaveBeenCalledTimes(2);
  });
});

function executorOf(): GenerationToolExecutor {
  return {
    async execute() {
      return { outcome: "SUCCEEDED", generationTaskId: "1", imageAssetIds: ["2"] };
    },
  };
}
