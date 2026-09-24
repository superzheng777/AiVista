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

export function skillActivityText(content: string): string {
  const legacy = content.match(/^已启用(.+)能力。?$/);
  return legacy ? `已加载技能：${legacy[1]}` : content;
}
