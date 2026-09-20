import { z } from "zod";

const optionSchema = z.object({
  value: z.string().regex(/^[A-Z][A-Z0-9_]{0,31}$/),
  label: z.string().min(1).max(40),
}).strict();

const baseField = {
  id: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,31}$/),
  label: z.string().min(1).max(40),
  required: z.boolean(),
};

const textFieldSchema = z.object({
  ...baseField,
  type: z.literal("TEXT"),
  initialValue: z.string().max(300).optional(),
  placeholder: z.string().max(100).optional(),
}).strict();

const selectFieldSchema = z.object({
  ...baseField,
  type: z.literal("SINGLE_SELECT"),
  initialValue: z.string().regex(/^[A-Z][A-Z0-9_]{0,31}$/).optional(),
  options: z.array(optionSchema).min(2).max(8),
  allowCustom: z.boolean(),
  customLabel: z.string().min(1).max(20).optional(),
  customInitialValue: z.string().max(300).optional(),
}).strict();

export const agentInputFormSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().min(1).max(60),
  fields: z.array(z.discriminatedUnion("type", [textFieldSchema, selectFieldSchema])).min(1).max(8),
}).strict();

export const creationFormResponseSchema = z.object({
  formId: z.string().regex(/^[1-9]\d*$/),
  status: z.enum(["PENDING", "SUBMITTED", "SKIPPED"]),
  form: agentInputFormSchema,
  answers: z.record(z.string(), z.object({
    kind: z.enum(["TEXT", "OPTION", "CUSTOM"]), value: z.string().max(300),
  }).strict()).nullable(),
  requestedAt: z.string().datetime({ offset: true }),
  resolvedAt: z.string().datetime({ offset: true }).nullable(),
});

export type AgentInputForm = z.infer<typeof agentInputFormSchema>;
export type CreationFormResponse = z.infer<typeof creationFormResponseSchema>;
