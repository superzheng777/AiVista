import { SessionManager } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { applyAgentInputResult, exportAgentContext,
  restoreAgentContext } from "../src/agent/agent-context.js";

describe("Agent context codec", () => {
  it("round-trips Pi messages and native compaction without persisting image bytes", () => {
    const original = SessionManager.inMemory("E:/aivista");
    const firstKeptId = original.appendMessage({ role: "user", content: [
      { type: "text", text: "修改这张图" },
      { type: "image", data: "base64-secret", mimeType: "image/webp" },
    ], timestamp: 1 });
    original.appendMessage({ role: "user", content: "保留暖色调", timestamp: 2 });
    original.appendMessage({ role: "toolResult", toolCallId: "call-inspect", toolName: "inspect_image",
      content: [
        { type: "text", text: "[已读取图片 Asset ID: 701]" },
        { type: "image", data: "historical-base64-secret", mimeType: "image/webp" },
      ], details: { outcome: "SUCCEEDED", assetId: "701" }, isError: false, timestamp: 3 });
    original.appendCompaction("用户正在制作暖色海报。", firstKeptId, 12_345);

    const snapshot = exportAgentContext(original, ["501"]);

    expect(JSON.stringify(snapshot)).not.toContain("base64-secret");
    expect(JSON.stringify(snapshot)).not.toContain("historical-base64-secret");
    expect(JSON.stringify(snapshot)).toContain("Asset ID: 501");
    expect(JSON.stringify(snapshot)).toContain("Asset ID: 701");
    expect(snapshot.compaction).toMatchObject({ summary: "用户正在制作暖色海报。", tokensBefore: 12_345 });

    const restored = SessionManager.inMemory("E:/aivista");
    restoreAgentContext(restored, snapshot);
    const context = restored.buildSessionContext();
    expect(context.messages[0]).toMatchObject({ role: "compactionSummary",
      summary: "用户正在制作暖色海报。" });
    expect(context.messages).toHaveLength(4);
  });

  it("rejects malformed persisted context instead of silently starting with corrupted history", () => {
    const session = SessionManager.inMemory("E:/aivista");
    expect(() => restoreAgentContext(session, { schemaVersion: 2, compaction: null, messages: [] }))
      .toThrow();
  });

  it("replaces a form placeholder with the submitted form while keeping the Tool Call immutable", () => {
    const original = pausedContext();
    const submitted = form({ brandName: "superZ", personality: "NATURAL_FRESH",
      logoType: "角色标，手绘轮廓" });

    const resolved = applyAgentInputResult(original, {
      creationId: "151", toolCallId: "call-form-1", status: "SUBMITTED", form: submitted,
    });

    expect(original.messages.at(-1)).toMatchObject({ details: { outcome: "WAITING_FOR_USER" } });
    expect(resolved.messages[1]).toEqual(original.messages[1]);
    expect(resolved.messages.filter((message) => message.role === "toolResult")).toHaveLength(1);
    expect(resolved.messages.at(-1)).toMatchObject({
      role: "toolResult", toolCallId: "call-form-1", toolName: "request_user_input", isError: false,
      details: { status: "SUBMITTED", form: submitted },
    });
    const message = resolved.messages.at(-1);
    const text = message?.role === "toolResult" && message.content[0]?.type === "text"
      ? message.content[0].text : "";
    expect(JSON.parse(text)).toEqual({ status: "SUBMITTED", form: submitted });
  });

  it.each([
    "SKIPPED",
    "CANCELLED",
  ] as const)("renders a status-only %s result without serializing the form", (status) => {
    const resolved = applyAgentInputResult(pausedContext(), {
      creationId: "151", toolCallId: "call-form-1", status, form: form(),
    });

    const message = resolved.messages.at(-1);
    const text = message?.role === "toolResult" && message.content[0]?.type === "text"
      ? message.content[0].text : "";
    expect(JSON.parse(text)).toEqual({ status });
    expect(message).toMatchObject({ details: { status } });
    expect(Reflect.get(message?.role === "toolResult" ? message.details : {}, "form")).toBeUndefined();
  });

  it("rejects an input result whose Tool Call is missing or does not match the persisted form", () => {
    const missingCall = pausedContext();
    missingCall.messages.splice(1, 1);
    const pending = { creationId: "151", toolCallId: "call-form-1", status: "SKIPPED" as const,
      form: form() };

    expect(() => applyAgentInputResult(missingCall, pending)).toThrow("exactly one matching");
    expect(() => applyAgentInputResult(pausedContext(), { ...pending,
      form: { ...form(), title: "另一个表单" } })).toThrow("persisted form placeholder");
  });

  it("rejects submitted forms that change anything except field values", () => {
    const changedDefinition = form({ brandName: "superZ" });
    changedDefinition.fields[0] = { ...changedDefinition.fields[0]!, label: "另一个字段" };

    expect(() => applyAgentInputResult(pausedContext(), {
      creationId: "151", toolCallId: "call-form-1", status: "SUBMITTED",
      form: changedDefinition,
    })).toThrow("persisted form placeholder");
  });

  it("rejects a submitted form whose required value is blank", () => {
    expect(() => applyAgentInputResult(pausedContext(), {
      creationId: "151", toolCallId: "call-form-1", status: "SUBMITTED", form: form(),
    })).toThrow("Submitted Agent input field brandName is required");
  });
});

function form(values: Partial<Record<"brandName" | "personality" | "logoType" | "constraints", string>> = {}) {
  return { schemaVersion: 2 as const, title: "Logo 设计需求确认", fields: [
  { id: "brandName", type: "TEXT" as const, label: "品牌/公司名称（准确拼写）", required: true,
    value: values.brandName ?? "", placeholder: "注意大小写" },
  { id: "personality", type: "SINGLE_SELECT" as const, label: "品牌性格倾向", required: false,
    value: values.personality ?? "",
    options: [{ value: "NATURAL_FRESH", label: "自然 · 清新" },
      { value: "PRECISE_TECH", label: "精密 · 科技感" }], allowCustom: true },
  { id: "logoType", type: "SINGLE_SELECT" as const, label: "期望的 Logo 架构", required: false,
    value: values.logoType ?? "",
    options: [{ value: "MASCOT", label: "角色 / 吉祥物" },
      { value: "WORDMARK", label: "纯字标" }], allowCustom: true },
  { id: "constraints", type: "TEXT" as const, label: "补充限制", required: false,
    value: values.constraints ?? "" },
] }; }

function pausedContext() {
  const value = form();
  return { schemaVersion: 1 as const, compaction: null, messages: [
    { role: "user" as const, content: "生成一张海报", timestamp: 1 },
    { role: "assistant" as const, content: [{ type: "toolCall" as const, id: "call-form-1",
      name: "request_user_input", arguments: { title: value.title, fields: value.fields } }],
    api: "openai-completions" as const, provider: "test", model: "test", usage: { input: 0, output: 0,
      cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "toolUse" as const, timestamp: 2 },
    { role: "toolResult" as const, toolCallId: "call-form-1", toolName: "request_user_input",
      content: [{ type: "text" as const, text: "需求确认表单已经展示，等待用户提交或跳过。" }],
      details: { outcome: "WAITING_FOR_USER", form: value }, isError: false, timestamp: 3 },
  ] };
}
