import type { AgentRuntimeEvent } from "./agent-runtime.js";

export function userFacingPlan(args: unknown): string | null {
  if (!args || typeof args !== "object") return null;
  const value = Reflect.get(args, "userFacingPlan");
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function toolLabel(toolName: string): string {
  if (toolName === "text_to_image") return "文生图";
  if (toolName === "image_to_image") return "图生图";
  if (toolName === "inspect_image") return "查看图片";
  return "创作工具";
}

export function selectedSkillName(toolName: string, args: unknown): string | null {
  if (toolName !== "read" || !args || typeof args !== "object" || !("path" in args)
      || typeof args.path !== "string") return null;
  const normalized = args.path.replaceAll("\\", "/");
  const match = normalized.match(/\/skills\/([a-z0-9-]+)\/SKILL\.md$/i);
  return match?.[1]?.toLowerCase() ?? null;
}

export function skillLabel(skillName: string): string {
  if (skillName === "poster-design") return "海报设计能力";
  if (skillName === "brand-design") return "品牌设计能力";
  if (skillName === "cinematic-still") return "电影感摄影能力";
  if (skillName === "impasto-diorama") return "油彩立体厚涂能力";
  if (skillName === "monumental-scale-poster") return "巨物尺度清透海报能力";
  return "创作能力";
}

export function toolOutcomeDetails(result: unknown): { outcome?: string; generationTaskId: string | null } {
  if (!result || typeof result !== "object" || !("details" in result)) return { generationTaskId: null };
  const details = result.details;
  if (!details || typeof details !== "object") return { generationTaskId: null };
  const outcome = "outcome" in details && typeof details.outcome === "string" ? details.outcome : undefined;
  const generationTaskId = "generationTaskId" in details && typeof details.generationTaskId === "string"
      && /^\d+$/.test(details.generationTaskId) ? details.generationTaskId : null;
  return outcome === undefined ? { generationTaskId } : { outcome, generationTaskId };
}

export function toolOutcome(event: Extract<AgentRuntimeEvent, { type: "tool_end" }>): "SUCCEEDED" | "FAILED" {
  if (event.isError) return "FAILED";
  return toolOutcomeDetails(event.result).outcome === "FAILED" ? "FAILED" : "SUCCEEDED";
}
