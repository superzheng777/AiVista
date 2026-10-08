import { readFile } from "node:fs/promises";
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
    expect(loaded.skills).toHaveLength(8);
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
      expect.objectContaining({
        name: "portrait-face-director",
        description: expect.stringContaining("五官结构"),
        disableModelInvocation: false,
      }),
      expect.objectContaining({
        name: "japanese-life-fragments",
        description: expect.stringContaining("亚克力收藏质感"),
        disableModelInvocation: false,
      }),
      expect.objectContaining({
        name: "series-image-director",
        description: expect.stringContaining("系列套图"),
        disableModelInvocation: false,
      }),
    ]));
  });

  it("allows reading Skill content and rejects files outside the Skill root", async () => {
    const tool = createSkillReadTool(cwd);
    const allowed = await tool.execute("read-1", { path: ".pi/skills/poster-design/SKILL.md" },
      undefined, undefined, {} as never);
    expect(allowed.content[0]).toEqual({ type: "text",
      text: await readFile(resolve(cwd, ".pi/skills/poster-design/SKILL.md"), "utf8") });
    const referencePath = ".pi/skills/cinematic-still/references/shot-language.md";
    const reference = await tool.execute("read-reference", { path: referencePath }, undefined, undefined, {} as never);
    expect(reference.content[0]).toEqual({ type: "text", text: await readFile(resolve(cwd, referencePath), "utf8") });
    await expect(tool.execute("read-2", { path: ".env.example" }, undefined, undefined, {} as never))
      .rejects.toThrow("read 只允许读取已发布的 Skill 文件");
  });
});
