import type { SessionItem } from "@/entities/generation/model/session";

type ToolItem = Extract<SessionItem, { kind: "tool" }>;
export type ToolActivityGroup = { id: string; kind: "tool-group"; tools: [ToolItem, ...ToolItem[]] };
type ProcessActivity = Extract<SessionItem, { kind: "text" }> | ToolActivityGroup;

const GROUPED_TOOLS = new Set(["text_to_image", "image_to_image", "inspect_image"]);

/** Group display rows only; keep individual calls in the session cache and Pi history. */
export function processActivities(items: readonly SessionItem[]): ProcessActivity[] {
  const activities: ProcessActivity[] = [];
  let group: ToolActivityGroup | undefined;
  for (const item of items) {
    // Image cards accompany their tool calls and do not interrupt the process sequence.
    if (item.kind === "generation") continue;
    if (item.kind !== "tool") {
      group = undefined;
      if (item.kind === "text" && item.phase === "process") activities.push(item);
      continue;
    }
    if (group && group.tools[0].name === item.name) {
      group.tools.push(item);
      continue;
    }
    const next: ToolActivityGroup = { id: item.id, kind: "tool-group", tools: [item] };
    activities.push(next);
    group = GROUPED_TOOLS.has(item.name) ? next : undefined;
  }
  return activities;
}

export function toolActivitySummary({ tools }: ToolActivityGroup): { progress: string; status: string } {
  const succeeded = tools.filter((tool) => tool.status === "SUCCEEDED").length;
  const failed = tools.filter((tool) => tool.status === "FAILED").length;
  const cancelled = tools.filter((tool) => tool.status === "CANCELLED").length;
  const running = tools.some((tool) => tool.status === "RUNNING");
  const progress = tools.length > 1 ? `（${succeeded}/${tools.length}）` : "";
  const status =
    succeeded === tools.length
      ? "已完成"
      : failed === tools.length
        ? "失败"
        : cancelled === tools.length
          ? "已取消"
          : [running ? "执行中" : "", failed ? `${failed} 次失败` : "", cancelled ? `${cancelled} 次取消` : ""]
              .filter(Boolean)
              .join(" · ");
  return { progress, status };
}

const SKILL_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  "poster-design": "海报设计",
  "brand-design": "品牌设计",
  "cinematic-still": "电影感摄影",
  "impasto-diorama": "油彩立体厚涂",
  "monumental-scale-poster": "巨物尺度清透海报",
  "portrait-face-director": "人像捏脸",
  "japanese-life-fragments": "日系生活碎片",
  "series-image-director": "系列套图",
};

export function skillDisplayName(skillName: string): string {
  return SKILL_DISPLAY_NAMES[skillName] ?? skillName;
}
