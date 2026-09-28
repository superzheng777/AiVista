import { z } from "zod";

export const profileFormSchema = z.object({
  nickname: z
    .string()
    .refine(
      (value) => Array.from(value.trim()).length >= 1 && Array.from(value.trim()).length <= 32,
      "昵称须为 1 到 32 个字符",
    )
    .refine((value) => !/\p{Cc}/u.test(value), "昵称不能包含控制字符"),
  bio: z
    .string()
    .refine((value) => Array.from(value).length <= 500, "个人简介不能超过 500 个字符")
    .refine((value) => !/\p{Cc}/u.test(value), "个人简介不能包含控制字符"),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;
