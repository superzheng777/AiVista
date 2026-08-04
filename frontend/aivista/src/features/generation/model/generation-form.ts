import { z } from "zod";

export const aspectRatioOptions = [
  { value: "1:1", label: "1:1 方形" },
  { value: "4:3", label: "4:3 横向" },
  { value: "3:4", label: "3:4 竖向" },
  { value: "16:9", label: "16:9 宽屏" },
  { value: "9:16", label: "9:16 竖屏" },
] as const;

function hasAtMostCodePoints(value: string, maximum: number): boolean {
  return Array.from(value).length <= maximum;
}

export const generationFormSchema = z.object({
  prompt: z.string().refine((value) => value.trim().length > 0, "请先描述你想生成的画面。").refine((value) => hasAtMostCodePoints(value, 1_000), "提示词不能超过 1000 个字符。"),
  negativePrompt: z.string().refine((value) => value.trim().length === 0 || hasAtMostCodePoints(value, 500), "负面提示词不能超过 500 个字符。").optional(),
  aspectRatio: z.enum(["1:1", "4:3", "3:4", "16:9", "9:16"]),
  promptExtend: z.boolean(),
  imageCount: z.number().int().min(1, "至少生成 1 张图片。").max(6, "一次最多生成 6 张图片。"),
});

export type GenerationFormValues = z.infer<typeof generationFormSchema>;
