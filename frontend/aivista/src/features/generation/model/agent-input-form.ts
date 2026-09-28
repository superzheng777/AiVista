import { z } from "zod";

import type { AgentInputForm } from "@/entities/generation/model/generation";

export function agentInputValuesSchema(form: AgentInputForm) {
  return z.object({ values: z.array(z.string()).length(form.fields.length) }).superRefine(({ values }, context) => {
    form.fields.forEach((field, index) => {
      const value = values[index] ?? "";
      let message: string | null = null;
      if (field.required && !value.trim()) message = `请填写${field.label}`;
      else if (Array.from(value).length > 300) message = `${field.label}不能超过 300 个字符`;
      else if (
        field.type === "SINGLE_SELECT" &&
        value &&
        !field.allowCustom &&
        !field.options.some((option) => option.value === value)
      )
        message = `请选择有效的${field.label}`;
      if (message) context.addIssue({ code: "custom", path: ["values", index], message });
    });
  });
}
