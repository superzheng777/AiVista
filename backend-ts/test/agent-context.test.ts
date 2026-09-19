import { SessionManager } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { exportAgentContext, restoreAgentContext } from "../src/agent/agent-context.js";

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
});
