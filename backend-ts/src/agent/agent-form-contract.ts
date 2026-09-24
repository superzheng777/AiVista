import { z } from "zod";

const nonBlankString = (maxLength: number) => z.string().min(1).max(maxLength)
  .refine((value) => value.trim().length > 0, { message: "Text must not be blank" });

const optionSchema = z.object({
  value: z.string().regex(/^[A-Z][A-Z0-9_]{0,31}$/),
  label: nonBlankString(40),
}).strict();

const baseField = {
  id: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,31}$/),
  label: nonBlankString(40),
  required: z.boolean(),
};

const textFieldSchema = z.object({
  ...baseField,
  type: z.literal("TEXT"),
  value: z.string().max(300),
  placeholder: z.string().max(100).optional(),
}).strict();

const selectFieldSchema = z.object({
  ...baseField,
  type: z.literal("SINGLE_SELECT"),
  value: z.string().max(300),
  options: z.array(optionSchema).min(2).max(8),
  allowCustom: z.boolean(),
  customLabel: nonBlankString(20).optional(),
}).strict();

export const agentInputFormSchema = z.object({
  schemaVersion: z.literal(2),
  title: nonBlankString(60),
  fields: z.array(z.discriminatedUnion("type", [textFieldSchema, selectFieldSchema])).min(1).max(8),
}).strict().superRefine((form, context) => {
  const fieldIds = new Set<string>();
  form.fields.forEach((field, fieldIndex) => {
    if (fieldIds.has(field.id)) {
      context.addIssue({ code: "custom", path: ["fields", fieldIndex, "id"],
        message: `Duplicate Agent input field ID: ${field.id}` });
    }
    fieldIds.add(field.id);
    if (field.type !== "SINGLE_SELECT") return;

    const optionValues = new Set<string>();
    field.options.forEach((option, optionIndex) => {
      if (optionValues.has(option.value)) {
        context.addIssue({ code: "custom", path: ["fields", fieldIndex, "options", optionIndex, "value"],
          message: `Duplicate option value in Agent input field ${field.id}: ${option.value}` });
      }
      optionValues.add(option.value);
    });
    if (field.value !== "" && !field.allowCustom && !optionValues.has(field.value)) {
      context.addIssue({ code: "custom", path: ["fields", fieldIndex, "value"],
        message: `Agent input field ${field.id} requires a value from its options` });
    }
    if (!field.allowCustom && field.customLabel !== undefined) {
      context.addIssue({ code: "custom", path: ["fields", fieldIndex, "customLabel"],
        message: `Agent input field ${field.id} does not allow a custom option` });
    }
  });
});

export const agentPendingInputSchema = z.object({
  creationId: z.string().regex(/^[1-9]\d*$/),
  toolCallId: z.string().min(1).max(128),
  status: z.enum(["PENDING", "SUBMITTED", "SKIPPED", "CANCELLED"]),
  form: agentInputFormSchema,
}).strict().superRefine((value, context) => {
  if (value.status !== "SUBMITTED") return;
  value.form.fields.forEach((field, fieldIndex) => {
    if (field.required && field.value.trim() === "") {
      context.addIssue({ code: "custom", path: ["form", "fields", fieldIndex, "value"],
        message: `Submitted Agent input field ${field.id} is required` });
    }
  });
});

export type AgentInputForm = z.infer<typeof agentInputFormSchema>;
export type AgentPendingInput = z.infer<typeof agentPendingInputSchema>;
