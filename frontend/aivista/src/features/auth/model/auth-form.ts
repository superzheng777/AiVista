import { z } from "zod";

export type AuthMode = "login" | "register";

export const authFormSchema = (mode: AuthMode) =>
  z
    .object({
      loginName: z.string().trim().min(4, "账号至少需要 4 个字符").max(32, "账号不能超过 32 个字符"),
      nickname: z.string(),
      password: z.string().min(8, "密码至少需要 8 个字符").max(64, "密码不能超过 64 个字符"),
      confirmPassword: z.string(),
      acceptedAgreement: z.boolean(),
    })
    .superRefine((values, context) => {
      if (mode !== "register") return;
      if (!/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(values.loginName)) {
        context.addIssue({
          code: "custom",
          path: ["loginName"],
          message: "账号须以字母开头，只能包含字母、数字或下划线",
        });
      }
      const nickname = values.nickname.trim();
      if (!nickname || Array.from(nickname).length > 32 || /\p{Cc}/u.test(nickname)) {
        context.addIssue({ code: "custom", path: ["nickname"], message: "昵称须为 1 到 32 个有效字符" });
      }
      if (!/[\p{L}\p{Nl}]/u.test(values.password) || !/\p{Nd}/u.test(values.password)) {
        context.addIssue({ code: "custom", path: ["password"], message: "密码须同时包含字母和数字" });
      }
      if (values.password !== values.confirmPassword) {
        context.addIssue({ code: "custom", path: ["confirmPassword"], message: "两次输入的密码不一致，请重新确认。" });
      }
      if (!values.acceptedAgreement) {
        context.addIssue({ code: "custom", path: ["acceptedAgreement"], message: "请先阅读并同意用户协议。" });
      }
    });

export type AuthFormValues = z.infer<ReturnType<typeof authFormSchema>>;
