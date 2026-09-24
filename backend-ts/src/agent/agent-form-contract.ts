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

const inputAnswerSchema = z.object({
  kind: z.enum(["TEXT", "OPTION", "CUSTOM"]),
  value: z.string().max(300),
}).strict();

export const agentPendingInputSchema = z.object({
  creationId: z.string().regex(/^[1-9]\d*$/),
  toolCallId: z.string().min(1).max(128),
  status: z.enum(["PENDING", "SUBMITTED", "SKIPPED", "CANCELLED"]),
  form: agentInputFormSchema,
  answers: z.record(z.string().regex(/^[a-z][a-zA-Z0-9_]{0,31}$/), inputAnswerSchema).nullable(),
}).strict().superRefine((value, context) => {
  if (value.status === "SUBMITTED" && value.answers === null) {
    context.addIssue({ code: "custom", path: ["answers"],
      message: "A submitted Agent input requires answers" });
  }
  if (value.status !== "SUBMITTED" && value.answers !== null) {
    context.addIssue({ code: "custom", path: ["answers"],
      message: `Agent input status ${value.status} must not contain answers` });
  }
});

export type AgentInputForm = z.infer<typeof agentInputFormSchema>;
export type AgentPendingInput = z.infer<typeof agentPendingInputSchema>;
