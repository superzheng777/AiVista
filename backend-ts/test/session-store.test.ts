import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { afterEach, describe, expect, it } from "vitest";
import { SessionStore, FORM_ANSWER } from "../src/sessions/session-store.js";
import { projectSession } from "../src/sessions/session-projector.js";
import { convertToLlm } from "@earendil-works/pi-coding-agent";
import { Value } from "typebox/value";
import { createGenerationTools } from "../src/agent/tools/generation.js";
import { runNormalGeneration } from "../src/sessions/normal-generation.js";
import { acceptFormAnswer, assetReferenceSchema, type CreationStart,
  type ExecutionSnapshot, type FormItem } from "../src/sessions/session-contract.js";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "aivista-session-"));
  directories.push(root);
  return new SessionStore(root, process.cwd());
}
const start: CreationStart = { creationId: "20", mode: "AGENT",
  input: { prompt: "设计咖啡海报", assets: [] }, settings: {} };
const state: ExecutionSnapshot = { creationId: "20", status: "WAITING_INPUT",
  revision: 2, completedAt: null, failureCode: null };
const form: FormItem = { id: "call-1", toolCallId: "call-1", kind: "form", status: "PENDING",
  schemaVersion: 2, title: "确认门店信息",
  fields: [{ id: "address", type: "TEXT", required: true, label: "地址", value: "" }] };

describe("Native session storage and projection", () => {
  it("projects durable image outcomes after parent cancellation without a Pi tool result", () => {
    const store = fixture();
    const manager = store.create("1", "10");
    store.start(manager, start);
    manager.appendMessage(fauxAssistantMessage([
      fauxToolCall("text_to_image", { prompt: "poster" }, { id: "image-1" }),
    ], { timestamp: 10, stopReason: "toolUse" }));
    const snapshot = { ...state, status: "CANCELLED" as const };
    const pending = { creationId: "20", item: { id: "image-1", kind: "generation" as const,
      generationId: "21", status: "RUNNING" as const, assets: [] } };
    expect(projectSession(manager.getBranch(), [snapshot], [pending])[0]?.items)
      .toContainEqual(pending.item);
    const done = { ...pending, item: { ...pending.item, status: "SUCCEEDED" as const,
      assets: [{ assetId: "31", url: "https://oss.example/31.png" }] } };
    const projected = projectSession(store.open("1", "10").getBranch(), [snapshot], [done])[0]!;
    expect(projected.status).toBe("CANCELLED");
    expect(projected.items.filter(item => item.kind === "generation")).toEqual([done.item]);
  });

  it("separates tool narration, submitted forms, final reply and image results after reopening", () => {
    const store = fixture();
    const manager = store.create("1", "10");
    store.start(manager, start);
    manager.appendMessage(fauxAssistantMessage([
      { type: "thinking", thinking: "private provider reasoning" },
      { type: "text", text: "先确认店名" },
      fauxToolCall("request_user_input", {}, { id: "call-1" }),
    ], { timestamp: 10, stopReason: "toolUse" }));
    manager.appendMessage({ role: "toolResult", toolCallId: "call-1", toolName: "request_user_input",
      content: [{ type: "text", text: "等待用户确认" }], isError: false, timestamp: 11,
      details: { form: { schemaVersion: 2, title: form.title, fields: form.fields } } });
    const pending = projectSession(manager.getBranch(), [state])[0]!;
    expect(pending.items).toMatchObject([
      { kind: "text", phase: "process", text: "先确认店名" },
      { kind: "tool", name: "request_user_input", status: "SUCCEEDED" },
      { kind: "form", status: "PENDING" },
    ]);
    manager.appendCustomMessageEntry(FORM_ANSWER, JSON.stringify(acceptFormAnswer("20", form, "SUBMITTED", { address: "云山路18号" })), false);
    manager.appendMessage(fauxAssistantMessage([
      { type: "text", text: "按确认的信息生成" },
      fauxToolCall("text_to_image", { prompt: "咖啡海报" }, { id: "image-1" }),
    ], { timestamp: 20, stopReason: "toolUse" }));
    manager.appendMessage({ role: "toolResult", toolCallId: "image-1", toolName: "text_to_image",
      content: [{ type: "text", text: "生成了1张图片" }, { type: "image", data: "private-image-bytes", mimeType: "image/png" }],
      details: { generationId: "21", status: "SUCCEEDED", assets: [{ assetId: "31", url: "https://oss.example/31.png" }] },
      isError: false, timestamp: 21 });
    manager.appendMessage(fauxAssistantMessage("海报已完成", { timestamp: 30 }));
    const projected = projectSession(store.open("1", "10").getBranch(), [{ ...state, status: "SUCCEEDED" }])[0]!;
    expect(projected.items.filter((item) => item.kind === "text")).toMatchObject([
      { text: "先确认店名", phase: "process" }, { text: "按确认的信息生成", phase: "process" },
      { text: "海报已完成", phase: "final" },
    ]);
    expect(projected.items.find((item) => item.kind === "form")).toMatchObject({ status: "SUBMITTED", fields: [{ value: "云山路18号" }] });
    expect(projected.items.filter((item) => item.kind === "generation")).toHaveLength(1);
    expect(projected.items.find((item) => item.id === "tool:image-1")).toEqual({
      id: "tool:image-1", kind: "tool", assistantMessageId: "assistant:20", toolCallId: "image-1", name: "text_to_image", status: "SUCCEEDED",
    });
    expect(JSON.stringify(projected)).not.toMatch(/private provider reasoning|private-image-bytes|"arguments"|"result"|生成了1张图片|等待用户确认/);
    expect(readFileSync(store.path("1", "10"), "utf8")).toContain("生成了1张图片");
  });

  it.each(["SKIPPED", "CANCELLED"] as const)("retains %s form operations without inventing a final reply", (action) => {
    const store = fixture();
    const manager = store.create("1", "10");
    store.start(manager, start);
    manager.appendMessage(fauxAssistantMessage([ { type: "text", text: "请先确认" },
      fauxToolCall("request_user_input", {}, { id: "call-1" }) ], { timestamp: 10, stopReason: "toolUse" }));
    manager.appendMessage({ role: "toolResult", toolCallId: "call-1", toolName: "request_user_input", timestamp: 11,
      content: [{ type: "text", text: "等待回答" }], isError: false,
      details: { form: { schemaVersion: 2, title: form.title, fields: form.fields } } });
    if (action === "SKIPPED") manager.appendCustomMessageEntry(FORM_ANSWER, JSON.stringify(acceptFormAnswer("20", form, action)), false);
    const turn = projectSession(store.open("1", "10").getBranch(), [{ ...state, status: action === "CANCELLED" ? "CANCELLED" : "RUNNING" }])[0]!;
    expect(turn.items.find((item) => item.kind === "form")).toMatchObject({ status: action });
    expect(turn.items.filter((item) => item.kind === "text").every((item) => item.phase === "process")).toBe(true);
  });

  it.each(["SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED"] as const)(
    "persists one native NORMAL tool pair and projects %s without a second user message", async (status) => {
      const store = fixture();
      const manager = store.create("1", "10");
      const normal: CreationStart = { ...start, mode: "NORMAL",
        input: { prompt: "调整咖啡海报", assets: [{ assetId: "1", url: "https://oss.example/input.png" }] },
        settings: { aspectRatio: "3:4", imageCount: 2, promptExtend: false, negativePrompt: "模糊" } };
      store.start(manager, normal);
      const assets = status === "FAILED" ? [] : [{ assetId: "31", url: "https://oss.example/31.png" },
        ...(status === "SUCCEEDED" ? [{ assetId: "32", url: "https://oss.example/32.png" }] : [])];
      await runNormalGeneration(manager, normal, async (id, request) => {
        expect(id).toBe("normal-20");
        expect(request).toMatchObject({ operation: "IMAGE_TO_IMAGE", promptExtend: false, inputAssetIds: ["1"] });
        return { generationId: "21", status, assets };
      });
      const reopened = store.open("1", "10");
      const messages = convertToLlm(reopened.buildSessionContext().messages);
      expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "toolResult"]);
      const assistant = messages[1]!;
      if (assistant.role !== "assistant") throw new Error("Missing call");
      const call = assistant.content[0]!;
      if (call.type !== "toolCall") throw new Error("Missing call");
      const tools = createGenerationTools({ authorizedInputAssetIds: new Set(["1"]),
        constraints: { aspectRatio: "AUTO", imageCount: 0 }, executor: { execute: async () => ({ generationId: "21", status, assets }) } });
      expect(Value.Check(tools[1]!.parameters, call.arguments)).toBe(true);
      expect(assistant).toMatchObject({ provider: "aivista", model: "programmatic-generation", usage: { totalTokens: 0 } });
      expect(messages[2]).toMatchObject({ toolCallId: call.id, isError: status === "FAILED", details: { status, assets } });
      expect(projectSession(reopened.getBranch(), [{ ...state, status }])[0]?.items).toEqual([
        { id: call.id, kind: "generation", generationId: "21", status, assets },
      ]);
      expect(readFileSync(store.path("1", "10"), "utf8")).not.toMatch(/generation_completed|generation_result/);
    });

  it("closes the native call with a failure result when execution throws", async () => {
    const store = fixture();
    const manager = store.create("1", "10");
    store.start(manager, { ...start, mode: "NORMAL" });
    await expect(runNormalGeneration(manager, { ...start, mode: "NORMAL",
      settings: { aspectRatio: "1:1", imageCount: 1 } }, async () => { throw new Error("quota"); }))
      .rejects.toThrow("quota");
    const reopened = store.open("1", "10");
    expect(reopened.buildSessionContext().messages.at(-1)).toMatchObject({ role: "toolResult", isError: true });
    expect(projectSession(reopened.getBranch(), [{ ...state, status: "FAILED" }])[0]?.items)
      .toMatchObject([{ kind: "generation", status: "FAILED", assets: [] }]);
  });

  it("persists the start and input before any assistant response and isolates users", () => {
    const store = fixture();
    const manager = store.create("1", "10");
    store.start(manager, start);
    manager.appendMessage({ role: "user", content: start.input.prompt, timestamp: Date.now() });
    expect(store.open("1", "10").getBranch()).toHaveLength(2);
    expect(() => store.open("2", "10")).toThrow();
    expect(() => store.create("1", "10")).toThrow();
    expect(() => store.path("../1", "10")).toThrow();
  });

  it("retains full display history after compaction while Pi restores only effective context", () => {
    const store = fixture();
    const manager = store.create("1", "10");
    store.start(manager, start);
    manager.appendMessage({ role: "user", content: "旧需求", timestamp: 1 });
    manager.appendMessage(fauxAssistantMessage("早期设计回复"));
    const keptId = manager.appendMessage({ role: "user", content: "修改标题", timestamp: 2 });
    manager.appendMessage(fauxAssistantMessage("保留的新回复"));
    manager.appendCompaction("咖啡海报需求摘要", keptId, 1000);
    const reopened = store.open("1", "10");
    const turns = projectSession(reopened.getBranch(), [state]);
    expect(turns[0]?.items.filter((item) => item.kind === "text").map((item) => item.text))
      .toEqual(["早期设计回复", "保留的新回复"]);
    const context = JSON.stringify(reopened.buildSessionContext().messages);
    expect(context).toContain("咖啡海报需求摘要");
    expect(context).not.toContain("早期设计回复");
    expect(context).toContain("保留的新回复");
  });

  it("folds a structured custom answer into its form and exposes it to the model", () => {
    const store = fixture();
    const manager = store.create("1", "10");
    store.start(manager, start);
    manager.appendMessage({ role: "toolResult", toolCallId: "call-1", toolName: "request_user_input",
      content: [{ type: "text", text: "等待用户确认" }], isError: false, timestamp: 1,
      details: { outcome: "WAITING_FOR_USER", form: { schemaVersion: 2, title: form.title, fields: form.fields } } });
    const answer = acceptFormAnswer("20", form, "SUBMITTED", { address: "云山路18号" });
    manager.appendCustomMessageEntry(FORM_ANSWER, JSON.stringify(answer), false);
    const reopened = store.open("1", "10");
    expect(projectSession(reopened.getBranch(), [state])[0]?.items.filter((item) => item.kind === "form")).toMatchObject([
      { kind: "form", status: "SUBMITTED", fields: [{ value: "云山路18号" }] },
    ]);
    expect(JSON.stringify(reopened.buildSessionContext().messages)).toContain("云山路18号");
    expect(readFileSync(store.path("1", "10"), "utf8")).toContain("custom_message");
    expect(() => acceptFormAnswer("20", form, "SUBMITTED", {})).toThrow();
    expect(() => acceptFormAnswer("20", form, "SUBMITTED", { injected: "x" })).toThrow();
    expect(acceptFormAnswer("20", form, "SKIPPED").action).toBe("SKIPPED");
  });

  it("rejects expiring or embedded image data in the persistent reference contract", () => {
    expect(assetReferenceSchema.safeParse({ assetId: "1", url: "https://oss.example/a.png" }).success).toBe(true);
    for (const url of ["https://oss.example/a.png?Signature=x", "data:image/png;base64,AAAA", "http://oss.example/a"]) {
      expect(assetReferenceSchema.safeParse({ assetId: "1", url }).success).toBe(false);
    }
  });
});
