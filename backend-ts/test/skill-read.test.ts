import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkillsFromDir } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { createSkillReadTool } from "../src/agent/tools/skill-read.js";

const cwd = resolve(fileURLToPath(new URL("../", import.meta.url)));

describe("project Skill resources", () => {
  it("discovers the published design Skills from their canonical SKILL.md files", () => {
    const loaded = loadSkillsFromDir({ dir: resolve(cwd, ".pi", "skills"), source: "project" });
    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.skills).toHaveLength(5);
    expect(loaded.skills).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "poster-design",
        description: expect.stringContaining("单画布海报"),
        disableModelInvocation: false,
      }),
      expect.objectContaining({
        name: "brand-design",
        description: expect.stringContaining("品牌标志"),
        disableModelInvocation: false,
      }),
      expect.objectContaining({
        name: "cinematic-still",
        description: expect.stringContaining("真实叙事电影剧照"),
        disableModelInvocation: false,
      }),
      expect.objectContaining({
        name: "impasto-diorama",
        description: expect.stringContaining("立体微景观"),
        disableModelInvocation: false,
      }),
      expect.objectContaining({
        name: "monumental-scale-poster",
        description: expect.stringContaining("巨大尺度感"),
        disableModelInvocation: false,
      }),
    ]));
  });

  it("allows reading Skill content and rejects files outside the Skill root", async () => {
    const tool = createSkillReadTool(cwd);
    const allowed = await tool.execute("read-1", { path: ".pi/skills/poster-design/SKILL.md" },
      undefined, undefined, {} as never);
    expect(allowed.content[0]).toMatchObject({ type: "text" });
    expect(allowed.content[0]).toMatchObject({
      text: expect.stringContaining("历史图片必须实际参与图生图"),
    });
    expect(allowed.content[0]).toMatchObject({
      text: expect.stringContaining("同一视觉方向的多个变体使用一次生成 Tool"),
    });
    const content = allowed.content[0]?.type === "text" ? allowed.content[0].text : "";
    expect(content).not.toContain("5.0Pro");
    expect(content).not.toContain("默认四张");
    expect(content).not.toContain("512 tokens");

    const brand = await tool.execute("read-brand", { path: ".pi/skills/brand-design/SKILL.md" },
      undefined, undefined, {} as never);
    expect(brand.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("不得虚构品牌历史、认证、奖项、口号"),
    });
    expect(brand.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("同一 Logo 架构和视觉母题的多个变体使用一次生成 Tool"),
    });
    const brandContent = brand.content[0]?.type === "text" ? brand.content[0].text : "";
    expect(brandContent).toContain("不能把单张位图结果冒充完整手册、SVG 或生产源文件");
    expect(brandContent).not.toContain("默认四张");

    const cinematic = await tool.execute("read-cinematic",
      { path: ".pi/skills/cinematic-still/SKILL.md" }, undefined, undefined, {} as never);
    const cinematicContent = cinematic.content[0]?.type === "text" ? cinematic.content[0].text : "";
    expect(cinematicContent).toContain("不得把 21:9 作为 Tool 参数");
    expect(cinematicContent).toContain("不同叙事功能、机位或 Prompt 的 Shot 1/2/3 必须使用独立 Tool Call");
    expect(cinematicContent).toContain("自由发挥”“随机”“其他细节你来定”不是信息不足");
    expect(cinematicContent).toContain("参考图只提供灵感时，一次只抽取一个维度");
    expect(cinematicContent).toContain("连续性圣经");
    expect(cinematicContent).not.toContain("generate_form_for_info_collection");
    expect(cinematicContent).not.toContain("image_super_resolution");

    const impasto = await tool.execute("read-impasto",
      { path: ".pi/skills/impasto-diorama/SKILL.md" }, undefined, undefined, {} as never);
    const impastoContent = impasto.content[0]?.type === "text" ? impasto.content[0].text : "";
    expect(impastoContent).toContain("每张照片分别制作一张独立作品");
    expect(impastoContent).toContain("每张只绑定一个 `inputAssetId`");
    expect(impastoContent).toContain("不能承诺原照片像素级不变");
    expect(impastoContent).not.toContain("Tool：`text_to_image`");

    const monumental = await tool.execute("read-monumental",
      { path: ".pi/skills/monumental-scale-poster/SKILL.md" }, undefined, undefined, {} as never);
    const monumentalContent = monumental.content[0]?.type === "text" ? monumental.content[0].text : "";
    expect(monumentalContent).toContain("上方巨物压近 + 中部明亮呼吸带");
    expect(monumentalContent).toContain("主题是唯一不可缺少的语义输入");
    expect(monumentalContent).toContain("画幅由用户请求和 Runtime 的 Creation 约束决定");
    expect(monumentalContent).not.toContain("generate_form_for_info_collection");
    expect(monumentalContent).not.toContain("image_super_resolution");

    const shotLanguage = await tool.execute("read-shot-language",
      { path: ".pi/skills/cinematic-still/references/shot-language.md" },
      undefined, undefined, {} as never);
    expect(shotLanguage.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("空间—人物—证据"),
    });
    expect(shotLanguage.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("候选只用于择优，不对应图片数量"),
    });
    await expect(tool.execute("read-2", { path: ".env.example" }, undefined, undefined, {} as never))
      .rejects.toThrow("read 只允许读取已发布的 Skill 文件");
  });
});
