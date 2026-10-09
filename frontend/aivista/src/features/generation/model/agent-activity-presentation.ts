import type { SessionItem } from "@/entities/generation/model/session";

type ToolItem = Extract<SessionItem, { kind: "tool" }>;
export type ToolActivityGroup = { id: string; kind: "tool-group"; tools: [ToolItem, ...ToolItem[]] };
type ProcessActivity = Extract<SessionItem, { kind: "text" }> | ToolActivityGroup;

const GROUPED_TOOLS = new Set(["text_to_image", "image_to_image", "inspect_image"]);

type ProcessStep = { id: string; assistantMessageId?: string; activities: ProcessActivity[] };

/** Group by the source assistant message; never infer ownership from adjacency. */
export function processSteps(items: readonly SessionItem[]): ProcessStep[] {
  const steps: ProcessStep[] = [];
  let step: ProcessStep | undefined;
  let group: ToolActivityGroup | undefined;
  const append = (activity: ProcessActivity, assistantMessageId?: string) => {
    if (!step || !assistantMessageId || step.assistantMessageId !== assistantMessageId) {
      step = { id: activity.id, assistantMessageId, activities: [] };
      steps.push(step);
    }
    step.activities.push(activity);
  };
  for (const item of items) {
    // Image cards accompany their tool calls and do not interrupt the process sequence.
    if (item.kind === "generation") continue;
    if (item.kind !== "tool") {
      group = undefined;
      if (item.kind === "text" && item.phase === "process") append(item, item.assistantMessageId);
      else step = undefined;
      continue;
    }
    // Preserve consecutive image-tool counts across replies with no intervening text/form.
    if (group && group.tools[0].name === item.name) {
      group.tools.push(item);
      continue;
    }
    const next: ToolActivityGroup = { id: item.id, kind: "tool-group", tools: [item] };
    append(next, item.assistantMessageId);
    group = GROUPED_TOOLS.has(item.name) ? next : undefined;
  }
  return steps;
}

export function toolActivityProgress({ tools }: ToolActivityGroup): string {
  const succeeded = tools.filter((tool) => tool.status === "SUCCEEDED").length;
  return tools.length > 1 ? `（${succeeded}/${tools.length}）` : "";
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
