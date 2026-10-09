import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { describe, expect, it } from "vitest";
import { generationToolResult } from "../src/agent/tools/generation.js";
import { createInspectImageTool } from "../src/agent/tools/inspect-image.js";
import { assistantItems, toolResultItems } from "../src/sessions/message-items.js";

describe("Tool display contract", () => {
  it.each(["read", "request_user_input", "text_to_image", "image_to_image", "inspect_image", "custom_tool"])(
    "omits %s parameters and results from both running and finished items", (name) => {
      const args = { path: "E:\\private\\skills\\poster-design\\SKILL.md", prompt: "private prompt", token: "private token" };
      const running = assistantItems(fauxAssistantMessage(fauxToolCall(name, args, { id: "call-1" }), { timestamp: 10 }))[0]!;
      const display = { id: "tool:call-1", kind: "tool", assistantMessageId: "assistant:10", toolCallId: "call-1", name,
        ...(name === "read" ? { skillName: "poster-design" } : {}) };
      expect(running).toEqual({ ...display, status: "RUNNING" });
      const result = { content: [{ type: "text", text: "private tool result" }], details: { secret: "private details" } };
      for (const isError of [false, true]) {
        const finished = toolResultItems("call-1", name, result, isError, name === "read" ? "poster-design" : undefined, "assistant:10")[0];
        expect(finished).toEqual({ ...display, status: isError ? "FAILED" : "SUCCEEDED" });
      }
    });

  it.each([false, true])("projects the inspect_image business result when failed=%s", async (failed) => {
    const tool = createInspectImageTool({ inspect: async (assetId) => {
      if (failed) throw new Error("Image is not authorized for this session");
      return { assetId, asset: { assetId, url: `https://oss.example/${assetId}.png` } };
    } });
    const result = await tool.execute("inspect-1", { assetId: "3" }, undefined, undefined, {} as never);

    expect(toolResultItems("inspect-1", tool.name, result, false)).toEqual([
      { id: "tool:inspect-1", kind: "tool", toolCallId: "inspect-1", name: "inspect_image",
        status: failed ? "FAILED" : "SUCCEEDED" },
    ]);
    expect(toolResultItems("inspect-1", tool.name, result, true)[0]).toMatchObject({ status: "FAILED" });
  });

  it.each(["text_to_image", "image_to_image"])("projects %s business failures and preserves partial deliveries", (name) => {
    for (const status of ["FAILED", "PARTIALLY_SUCCEEDED", "SUCCEEDED"] as const) {
      const generated = { status, generationId: status === "FAILED" ? null : "2",
        assets: status === "FAILED" ? [] : [{ assetId: "3", url: "https://oss.example/3.png" }] };
      const result = generationToolResult(generated);
      expect(toolResultItems("image-1", name, result, false)).toEqual([
        { id: "tool:image-1", kind: "tool", toolCallId: "image-1", name,
          status: status === "FAILED" ? "FAILED" : "SUCCEEDED" },
        { ...generated, id: "image-1", kind: "generation" },
      ]);
      expect(toolResultItems("image-1", name, result, true)[0]).toMatchObject({ status: "FAILED" });
    }
  });

  it("still projects functional form fields and image assets separately from tool summaries", () => {
    const form = { schemaVersion: 2, title: "确认店名", fields: [
      { id: "name", label: "店名", type: "TEXT", required: true, value: "拾光咖啡" },
    ] };
    expect(toolResultItems("form-1", "request_user_input", { details: { form } }, false)[1]).toEqual({
      ...form, id: "form-1", kind: "form", toolCallId: "form-1", status: "PENDING",
    });
    const generated = { generationId: "2", status: "SUCCEEDED", assets: [
      { assetId: "3", url: "https://oss.example/3.png" },
    ] };
    expect(toolResultItems("image-1", "text_to_image", { details: generated }, false)[1]).toEqual({
      ...generated, id: "image-1", kind: "generation",
    });
  });
});
