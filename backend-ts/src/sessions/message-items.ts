import type { AssistantMessage } from "@earendil-works/pi-ai";
import { agentInputFormSchema } from "../agent/agent-form-contract.js";
import { generationResultSchema, type CreationItem } from "./session-contract.js";

export function assistantItems(message: AssistantMessage, phase: "process" | "final" = "process"): CreationItem[] {
  return message.content.flatMap<CreationItem>((block, index) => {
    if (block.type === "text" && block.text.trim()) {
      return [{ id: `text:${message.timestamp}:${index}`, kind: "text", text: block.text, phase }];
    }
    if (block.type !== "toolCall") return [];
    const skillName = toolSkillName(block.name, block.arguments);
    const items: CreationItem[] = [{ id: `tool:${block.id}`, kind: "tool", toolCallId: block.id,
      name: block.name, ...(skillName ? { skillName } : {}), status: "RUNNING" }];
    if (isGeneration(block.name)) items.push({ id: block.id, kind: "generation", generationId: null,
      status: "RUNNING", assets: [] });
    return items;
  });
}

/** Tool details stay in Pi history; only status and structured form/image cards reach the browser. */
export function toolResultItems(toolCallId: string, name: string, result: unknown, isError: boolean,
    skillName?: string): CreationItem[] {
  const value = object(result);
  const items: CreationItem[] = [{ id: `tool:${toolCallId}`, kind: "tool", toolCallId, name,
    ...(skillName ? { skillName } : {}), status: isError ? "FAILED" : "SUCCEEDED" }];
  if (name === "request_user_input" && !isError) {
    const form = agentInputFormSchema.safeParse(object(value.details).form);
    if (form.success) items.push({ ...form.data, id: toolCallId, kind: "form", toolCallId, status: "PENDING" });
  } else if (isGeneration(name)) {
    const generated = generationResultSchema.safeParse(value.details);
    items.push({ id: toolCallId, kind: "generation", generationId: generated.success ? generated.data.generationId : null,
      status: generated.success ? generated.data.status : "FAILED", assets: generated.success ? generated.data.assets : [] });
  }
  return items;
}

/** Preserve the existing skill title without exposing the tool's filesystem path. */
export function toolSkillName(name: string, args: unknown): string | undefined {
  const path = object(args).path;
  if (name !== "read" || typeof path !== "string") return undefined;
  const parts = path.replaceAll("\\", "/").split("/");
  return parts.at(-1) === "SKILL.md" ? parts.at(-2) || undefined : undefined;
}

function isGeneration(name: string): boolean { return name === "text_to_image" || name === "image_to_image"; }
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}
