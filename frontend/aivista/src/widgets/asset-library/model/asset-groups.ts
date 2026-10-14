import { type GenerationAsset } from "@/entities/image-resource/model/image-resource";

const day = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const weekday = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", weekday: "long" });

export function groupsOf(assets: GenerationAsset[]) {
  const groups = new Map<string, { key: string; label: string; weekday: string; items: GenerationAsset[] }>();
  for (const asset of assets) {
    const date = new Date(asset.createdAt);
    const key = date.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
    const group = groups.get(key) ?? { key, label: day.format(date), weekday: weekday.format(date), items: [] };
    group.items.push(asset);
    groups.set(key, group);
  }
  return [...groups.values()];
}
