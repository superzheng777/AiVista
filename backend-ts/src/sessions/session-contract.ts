import { z } from "zod";
import { agentInputFormSchema } from "../agent/agent-form-contract.js";

export const CREATION_LIMIT = 30;
export const idSchema = z.string().regex(/^[1-9]\d*$/);
export const assetReferenceSchema = z.object({
  assetId: idSchema,
  url: z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.search && !url.hash && !url.username && !url.password;
  }, "Session image references must be unsigned HTTPS URLs"),
});
export const creationSettingsSchema = z.object({
  aspectRatio: z.enum(["1:1", "4:3", "3:4", "16:9", "9:16"]).optional(),
  imageCount: z.number().int().min(1).max(6).optional(),
  negativePrompt: z.string().max(500).optional(),
  promptExtend: z.boolean().optional(),
}).strict();
export const creationStartSchema = z.object({
  creationId: idSchema,
  mode: z.enum(["NORMAL", "AGENT"]),
  input: z.object({ prompt: z.string().min(1).max(1000), assets: z.array(assetReferenceSchema).max(3) }),
  settings: creationSettingsSchema,
});
export const formAnswerSchema = z.object({
  creationId: idSchema,
  toolCallId: z.string().min(1).max(128),
  action: z.enum(["SUBMITTED", "SKIPPED"]),
  title: z.string(),
  fields: z.array(z.object({ id: z.string(), label: z.string(), value: z.string() })),
});
export type CreationStart = z.infer<typeof creationStartSchema>;
export type AssetReference = z.infer<typeof assetReferenceSchema>;
export const generationResultSchema = z.object({
  generationId: idSchema.nullable(),
  status: z.enum(["SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED"]),
  assets: z.array(assetReferenceSchema),
  code: z.string().optional(),
  message: z.string().optional(),
  retryable: z.boolean().optional(),
});
export type GenerationResult = z.infer<typeof generationResultSchema>;
export type FormAnswer = z.infer<typeof formAnswerSchema>;
export type ExecutionStatus = "QUEUED" | "RUNNING" | "WAITING_INPUT" | "SUCCEEDED"
  | "PARTIALLY_SUCCEEDED" | "FAILED" | "CANCELLED";
export type FormItem = {
  id: string; kind: "form"; toolCallId: string;
  status: "PENDING" | "SUBMITTED" | "SKIPPED" | "CANCELLED";
} & z.infer<typeof agentInputFormSchema>;
export type GenerationItem = {
  id: string; kind: "generation"; generationId: string | null;
  status: ExecutionStatus; assets: AssetReference[];
};
export type CreationItem =
  | { id: string; kind: "text"; text: string; phase: "process" | "final" }
  | { id: string; kind: "tool"; toolCallId: string; name: string; skillName?: string;
      status: "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED" }
  | FormItem | GenerationItem;
export type CreationTurn = CreationStart & {
  status: ExecutionStatus; revision: number; items: CreationItem[];
  createdAt: string; completedAt: string | null; failureCode: string | null;
};
export type ExecutionSnapshot = Pick<CreationTurn,
  "creationId" | "status" | "revision" | "completedAt" | "failureCode">;

/** Validate submitted values against the persisted definition, never a client-supplied form. */
export function acceptFormAnswer(creationId: string, item: FormItem,
    action: "SUBMITTED" | "SKIPPED", values: Record<string, string> = {}): FormAnswer {
  if (Object.keys(values).some((id) => !item.fields.some((field) => field.id === id))) {
    throw new Error("Unknown form field");
  }
  const form = agentInputFormSchema.parse({ schemaVersion: item.schemaVersion, title: item.title,
    fields: item.fields.map((field) => ({ ...field,
      value: action === "SKIPPED" ? "" : (values[field.id] ?? "").trim() })) });
  if (action === "SUBMITTED" && form.fields.some((field) => field.required && !field.value)) {
    throw new Error("Required form field is missing");
  }
  return formAnswerSchema.parse({ creationId, toolCallId: item.toolCallId, action, title: form.title,
    fields: form.fields.map(({ id, label, value }) => ({ id, label, value })) });
}
