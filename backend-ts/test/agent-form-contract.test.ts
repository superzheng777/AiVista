import { describe, expect, it } from "vitest";
import { Value } from "typebox/value";
import { agentInputFormSchema, agentPendingInputSchema } from "../src/agent/agent-form-contract.js";
import { createRequestUserInputTool } from "../src/agent/tools/request-user-input.js";

describe("Agent form contract", () => {
  it("uses one mutable value on every field", () => {
    expect(agentInputFormSchema.parse(form())).toEqual(form());
    expect(agentInputFormSchema.parse(form("自定义方向", true)).fields[1])
      .toMatchObject({ value: "自定义方向", allowCustom: true });
  });

  it("rejects legacy answer and initial-value fields", () => {
    expect(() => agentInputFormSchema.parse({ ...form(), fields: [
      { ...form().fields[0], initialValue: "旧值" },
      form().fields[1],
    ] })).toThrow();
    expect(() => agentPendingInputSchema.parse({
      creationId: "151", toolCallId: "call-form", status: "SKIPPED", form: form(), answers: null,
    })).toThrow();
  });

  it("rejects blank display text before the form reaches Java", () => {
    expect(() => agentInputFormSchema.parse({ ...form(), title: "   " })).toThrow("Text must not be blank");
    expect(() => agentInputFormSchema.parse({ ...form(), fields: [
      { ...form().fields[0], label: "\t" },
      form().fields[1],
    ] })).toThrow("Text must not be blank");
  });

  it("allows blank proposed values but requires submitted mandatory values", () => {
    expect(agentPendingInputSchema.parse({
      creationId: "151", toolCallId: "call-form", status: "PENDING", form: form(),
    })).toMatchObject({ status: "PENDING" });
    expect(() => agentPendingInputSchema.parse({
      creationId: "151", toolCallId: "call-form", status: "SUBMITTED", form: form(),
    })).toThrow("Submitted Agent input field subject is required");
  });

  it("accepts a custom select value only when the field allows it", () => {
    expect(() => agentInputFormSchema.parse(form("自定义方向")))
      .toThrow("requires a value from its options");
    expect(agentInputFormSchema.parse(form("POSTER", false)).fields[1])
      .toMatchObject({ value: "POSTER" });
  });

  it("rejects blank display text in both persisted and model-facing schemas", () => {
    expect(() => agentInputFormSchema.parse({ ...form(), title: " \t " }))
      .toThrow("Text must not be blank");
    const blankFieldLabel = structuredClone(form());
    blankFieldLabel.fields[0]!.label = "   ";
    expect(() => agentInputFormSchema.parse(blankFieldLabel)).toThrow("Text must not be blank");
    const blankOptionLabel = structuredClone(form());
    const select = blankOptionLabel.fields[1]!;
    if (select.type !== "SINGLE_SELECT") throw new Error("Expected select test fixture");
    select.options[0]!.label = "\n";
    expect(() => agentInputFormSchema.parse(blankOptionLabel)).toThrow("Text must not be blank");

    const tool = createRequestUserInputTool();
    const valid = { title: "确认需求", fields: [
      { id: "subject", type: "TEXT", label: "主题", required: true, value: "" },
    ] };
    expect(Value.Check(tool.parameters, valid)).toBe(true);
    expect(Value.Check(tool.parameters, { ...valid, title: "   " })).toBe(false);
    expect(Value.Check(tool.parameters, { ...valid, fields: [
      { ...valid.fields[0], label: "\t" },
    ] })).toBe(false);
    const validSelect = { title: "确认需求", fields: [{
      id: "format", type: "SINGLE_SELECT", label: "成品类型", required: false, value: "",
      options: [{ value: "POSTER", label: "海报" }, { value: "LOGO", label: "Logo" }],
      allowCustom: true, customLabel: "自定义",
    }] };
    expect(Value.Check(tool.parameters, validSelect)).toBe(true);
    expect(Value.Check(tool.parameters, { ...validSelect, fields: [{
      ...validSelect.fields[0], options: [
        { value: "POSTER", label: " " }, { value: "LOGO", label: "Logo" },
      ],
    }] })).toBe(false);
    expect(Value.Check(tool.parameters, { ...validSelect, fields: [{
      ...validSelect.fields[0], customLabel: "\n",
    }] })).toBe(false);
  });
});

function form(selectValue = "", allowCustom = false) {
  return {
    schemaVersion: 2 as const,
    title: "确认创作方向",
    fields: [
      { id: "subject", type: "TEXT" as const, label: "主题", required: true, value: "" },
      {
        id: "format",
        type: "SINGLE_SELECT" as const,
        label: "成品类型",
        required: false,
        value: selectValue,
        options: [
          { value: "POSTER", label: "海报" },
          { value: "LOGO", label: "Logo" },
        ],
        allowCustom,
      },
    ],
  };
}
