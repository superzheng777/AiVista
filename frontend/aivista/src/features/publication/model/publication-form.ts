import { z } from "zod";

function hasAtMostCodePoints(value: string, maximum: number): boolean {
  return Array.from(value).length <= maximum;
}

export const publicationFormSchema = z.object({
  title: z.string()
    .refine((value) => value.trim().length > 0, "请填写作品标题。")
    .refine((value) => hasAtMostCodePoints(value.trim(), 100), "标题不能超过 100 个字符。"),
  description: z.string()
    .refine((value) => value.trim().length > 0, "请填写作品描述。")
    .refine((value) => hasAtMostCodePoints(value.trim(), 500), "描述不能超过 500 个字符。"),
});

export type PublicationFormValues = z.infer<typeof publicationFormSchema>;
