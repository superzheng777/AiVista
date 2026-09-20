import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { AgentInputForm } from "../agent-form-contract.js";

export type { AgentInputForm } from "../agent-form-contract.js";

export const REQUEST_USER_INPUT_TOOL_NAME = "request_user_input";

const fieldId = Type.String({
  pattern: "^[a-z][a-zA-Z0-9_]{0,31}$",
  description: "字段 ID；在当前表单内唯一。",
});

const option = Type.Object({
  value: Type.String({ pattern: "^[A-Z][A-Z0-9_]{0,31}$" }),
  label: Type.String({ minLength: 1, maxLength: 40 }),
}, { additionalProperties: false });

const textField = Type.Object({
  id: fieldId,
  type: Type.Literal("TEXT"),
  label: Type.String({ minLength: 1, maxLength: 40 }),
  required: Type.Boolean(),
  initialValue: Type.Optional(Type.String({ maxLength: 300 })),
  placeholder: Type.Optional(Type.String({ maxLength: 100 })),
}, { additionalProperties: false });

const singleSelectField = Type.Object({
  id: fieldId,
  type: Type.Literal("SINGLE_SELECT"),
  label: Type.String({ minLength: 1, maxLength: 40 }),
  required: Type.Boolean(),
  initialValue: Type.Optional(Type.String({ pattern: "^[A-Z][A-Z0-9_]{0,31}$" })),
  options: Type.Array(option, { minItems: 2, maxItems: 8 }),
  allowCustom: Type.Boolean(),
  customLabel: Type.Optional(Type.String({ minLength: 1, maxLength: 20 })),
  customInitialValue: Type.Optional(Type.String({ maxLength: 300 })),
}, { additionalProperties: false });

const parameters = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 60,
    description: "表单标题，应直接说明需要用户确认的创作信息。" }),
  fields: Type.Array(Type.Union([textField, singleSelectField]), { minItems: 1, maxItems: 8 }),
}, { additionalProperties: false });

export type AgentInputRequest = {
  toolCallId: string;
  form: AgentInputForm;
};

export type AgentInputRequestDetails = {
  outcome: "WAITING_FOR_USER";
  form: AgentInputForm;
};

/** Pauses the Pi loop after persisting a normal, model-visible Tool Result. */
export function createRequestUserInputTool(): ToolDefinition<typeof parameters, AgentInputRequestDetails> {
  return defineTool({
    name: REQUEST_USER_INPUT_TOOL_NAME,
    label: "确认创作需求",
    description: "仅当缺失信息会实质改变创作结果时，向用户展示一张结构化需求确认表单。一次尽量问全；可由你决定的普通设计选择不要询问。",
    parameters,
    executionMode: "sequential",
    async execute(_toolCallId, params, signal) {
      signal?.throwIfAborted();
      const form = normalizeForm(params as Omit<AgentInputForm, "schemaVersion">);
      return {
        content: [{ type: "text", text: "需求确认表单已经展示，等待用户提交或跳过。" }],
        details: { outcome: "WAITING_FOR_USER", form },
        terminate: true,
      };
    },
  });
}

export function inputRequestFromToolResult(toolCallId: string, result: unknown): AgentInputRequest | undefined {
  if (!result || typeof result !== "object") return undefined;
  const details = Reflect.get(result, "details");
  if (!details || typeof details !== "object" || Reflect.get(details, "outcome") !== "WAITING_FOR_USER") {
    return undefined;
  }
  const form = Reflect.get(details, "form");
  if (!form || typeof form !== "object") return undefined;
  return { toolCallId, form: form as AgentInputForm };
}

function normalizeForm(value: Omit<AgentInputForm, "schemaVersion">): AgentInputForm {
  const ids = new Set<string>();
  const fields = value.fields.map((field) => {
    if (ids.has(field.id)) throw new Error(`表单字段 ID 重复：${field.id}`);
    ids.add(field.id);
    if (field.type === "TEXT") return { ...field };
    const optionValues = new Set<string>();
    for (const item of field.options) {
      if (optionValues.has(item.value)) throw new Error(`字段 ${field.id} 的选项值重复：${item.value}`);
      optionValues.add(item.value);
    }
    if (field.initialValue && !optionValues.has(field.initialValue)) {
      throw new Error(`字段 ${field.id} 的 initialValue 必须来自 options`);
    }
    if (!field.allowCustom
        && (field.customLabel !== undefined || field.customInitialValue !== undefined)) {
      throw new Error(`字段 ${field.id} 未开放自定义选项`);
    }
    return { ...field, options: field.options.map((item) => ({ ...item })) };
  });
  return { schemaVersion: 1, title: value.title, fields };
}
