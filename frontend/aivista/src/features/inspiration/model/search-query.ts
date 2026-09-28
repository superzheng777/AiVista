import { z } from "zod";

export function normalizeSearchInput(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function searchQueryKey(value: string): string {
  return normalizeSearchInput(value).toLocaleLowerCase();
}

export const searchFormSchema = z.object({
  keyword: z
    .string()
    .refine((value) => Boolean(normalizeSearchInput(value)), "请输入搜索关键词")
    .refine((value) => Array.from(normalizeSearchInput(value)).length <= 100, "搜索关键词不能超过 100 个字符"),
});

export type SearchFormValues = z.infer<typeof searchFormSchema>;
