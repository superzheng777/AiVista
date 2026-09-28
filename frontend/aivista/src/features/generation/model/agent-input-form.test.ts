import { describe, expect, it } from "vitest";

import type { AgentInputForm } from "@/entities/generation/model/generation";
import { agentInputValuesSchema } from "@/features/generation/model/agent-input-form";

const form: AgentInputForm = {
  schemaVersion: 2,
  title: "确认方向",
  fields: [
    { id: "subject", type: "TEXT", label: "主题", required: true, value: "" },
    {
      id: "style",
      type: "SINGLE_SELECT",
      label: "风格",
      required: true,
      value: "",
      options: [{ value: "WARM", label: "温暖" }],
      allowCustom: false,
    },
  ],
};

describe("agent input form", () => {
  it("checks required values and rejects unknown fixed options", () => {
    const schema = agentInputValuesSchema(form);
    expect(schema.safeParse({ values: ["", "WARM"] }).success).toBe(false);
    expect(schema.safeParse({ values: ["主题", "OTHER"] }).success).toBe(false);
    expect(schema.safeParse({ values: ["主题", "WARM"] }).success).toBe(true);
  });

  it("accepts custom values only when the model allowed them", () => {
    const style = form.fields[1]!;
    if (style.type !== "SINGLE_SELECT") throw new Error("Expected a single-select field");
    const customForm: AgentInputForm = {
      ...form,
      fields: [form.fields[0]!, { ...style, allowCustom: true }],
    };
    expect(agentInputValuesSchema(customForm).safeParse({ values: ["主题", "手绘"] }).success).toBe(true);
  });
});
