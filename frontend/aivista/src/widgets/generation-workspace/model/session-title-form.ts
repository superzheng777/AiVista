import { z } from "zod";

export const sessionTitleFormSchema = z.object({
  title: z.string().trim().min(1, "请输入会话名称").max(100, "会话名称不能超过 100 字"),
});

export type SessionTitleFormValues = z.infer<typeof sessionTitleFormSchema>;
