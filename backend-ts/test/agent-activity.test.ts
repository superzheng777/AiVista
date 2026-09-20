import { describe, expect, it } from "vitest";
import { AgentActivityCollector } from "../src/agent/agent-activity.js";

describe("AgentActivityCollector", () => {
  it("keeps live Tool starts in memory and snapshots only final user-visible steps", () => {
    const times = [new Date("2026-09-09T01:00:00Z"), new Date("2026-09-09T01:01:00Z")];
    const collector = new AgentActivityCollector(() => times.shift()!);

    collector.accept({ type: "text_end", contentIndex: 0, text: " 我先整理海报布局。 " });
    collector.accept({ type: "tool_start", toolCallId: "call-1", toolName: "text_to_image", args: {} });
    expect(collector.snapshot()).toEqual([
      expect.objectContaining({ type: "NARRATION", outcome: "COMPLETED", content: "我先整理海报布局。" }),
    ]);

    collector.accept({ type: "tool_end", toolCallId: "call-1", toolName: "text_to_image",
      result: { details: { outcome: "SUCCEEDED", generationTaskId: "9001" } }, isError: false });
    expect(collector.snapshot()).toEqual([
      expect.objectContaining({ type: "NARRATION", outcome: "COMPLETED" }),
      expect.objectContaining({ type: "TOOL", outcome: "COMPLETED", content: "文生图已完成。",
        generationTaskId: "9001" }),
    ]);
  });

  it("keeps the last assistant text out of Activity because it is the final message", () => {
    const collector = new AgentActivityCollector();
    collector.accept({ type: "text_end", contentIndex: 0, text: "这是最终回答。" });
    collector.discardFinalText();
    expect(collector.snapshot()).toEqual([]);
  });

  it("projects a business-level Tool failure as a final failed step", () => {
    const collector = new AgentActivityCollector(() => new Date("2026-09-09T01:00:00Z"));
    collector.accept({ type: "tool_start", toolCallId: "call-2", toolName: "image_to_image", args: {} });
    collector.accept({ type: "tool_end", toolCallId: "call-2", toolName: "image_to_image",
      result: { details: { outcome: "FAILED", code: "GENERATION_FAILED", generationTaskId: "9002" } },
      isError: false });
    expect(collector.snapshot()).toEqual([expect.objectContaining({ outcome: "FAILED",
      content: "图生图未完成。", generationTaskId: "9002" })]);
  });

  it("persists a successfully read Skill as SKILL rather than a generic Tool", () => {
    const collector = new AgentActivityCollector(() => new Date("2026-09-09T01:00:00Z"));
    collector.accept({ type: "tool_start", toolCallId: "read-1", toolName: "read",
      args: { path: "C:/app/.pi/skills/poster-design/SKILL.md" } });
    collector.accept({ type: "tool_end", toolCallId: "read-1", toolName: "read",
      result: { content: [{ type: "text", text: "skill body" }] }, isError: false });
    expect(collector.snapshot()).toEqual([expect.objectContaining({ type: "SKILL",
      outcome: "COMPLETED", content: "已启用海报设计能力。" })]);
  });

  it("uses the public label for the brand-design Skill", () => {
    const collector = new AgentActivityCollector(() => new Date("2026-09-09T01:00:00Z"));
    collector.accept({ type: "tool_start", toolCallId: "read-brand", toolName: "read",
      args: { path: "C:/app/.pi/skills/brand-design/SKILL.md" } });
    collector.accept({ type: "tool_end", toolCallId: "read-brand", toolName: "read",
      result: { content: [{ type: "text", text: "skill body" }] }, isError: false });
    expect(collector.snapshot()).toEqual([expect.objectContaining({ type: "SKILL",
      outcome: "COMPLETED", content: "已启用品牌设计能力。" })]);
  });

  it("uses the public label for the cinematic-still Skill", () => {
    const collector = new AgentActivityCollector(() => new Date("2026-09-09T01:00:00Z"));
    collector.accept({ type: "tool_start", toolCallId: "read-cinematic", toolName: "read",
      args: { path: "C:/app/.pi/skills/cinematic-still/SKILL.md" } });
    collector.accept({ type: "tool_end", toolCallId: "read-cinematic", toolName: "read",
      result: { content: [{ type: "text", text: "skill body" }] }, isError: false });
    expect(collector.snapshot()).toEqual([expect.objectContaining({ type: "SKILL",
      outcome: "COMPLETED", content: "已启用电影感摄影能力。" })]);
  });

  it("uses the public label for the impasto-diorama Skill", () => {
    const collector = new AgentActivityCollector(() => new Date("2026-09-09T01:00:00Z"));
    collector.accept({ type: "tool_start", toolCallId: "read-impasto", toolName: "read",
      args: { path: "C:/app/.pi/skills/impasto-diorama/SKILL.md" } });
    collector.accept({ type: "tool_end", toolCallId: "read-impasto", toolName: "read",
      result: { content: [{ type: "text", text: "skill body" }] }, isError: false });
    expect(collector.snapshot()).toEqual([expect.objectContaining({ type: "SKILL",
      outcome: "COMPLETED", content: "已启用油彩立体厚涂能力。" })]);
  });

  it("uses the public label for the monumental-scale-poster Skill", () => {
    const collector = new AgentActivityCollector(() => new Date("2026-09-09T01:00:00Z"));
    collector.accept({ type: "tool_start", toolCallId: "read-monumental", toolName: "read",
      args: { path: "C:/app/.pi/skills/monumental-scale-poster/SKILL.md" } });
    collector.accept({ type: "tool_end", toolCallId: "read-monumental", toolName: "read",
      result: { content: [{ type: "text", text: "skill body" }] }, isError: false });
    expect(collector.snapshot()).toEqual([expect.objectContaining({ type: "SKILL",
      outcome: "COMPLETED", content: "已启用巨物尺度清透海报能力。" })]);
  });

  it("keeps narration before a subsequently selected Skill in persisted order", () => {
    const collector = new AgentActivityCollector(() => new Date("2026-09-19T00:00:00Z"));
    collector.accept({ type: "turn_start", turn: 1 });
    collector.accept({ type: "text_end", contentIndex: 0, text: "我会先明确海报的视觉方向。" });
    collector.accept({ type: "tool_start", toolCallId: "skill-1", toolName: "read",
      args: { path: "E:/project/.pi/skills/poster-design/SKILL.md" } });
    collector.accept({ type: "tool_end", toolCallId: "skill-1", toolName: "read",
      result: { content: [] }, isError: false });

    expect(collector.snapshot().map((activity) => activity.type)).toEqual(["NARRATION", "SKILL"]);
  });
});
