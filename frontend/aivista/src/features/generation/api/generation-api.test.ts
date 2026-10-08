import { beforeEach, describe, expect, it, vi } from "vitest";
import { browserApiClient } from "@/shared/api/browser-client";
import { createAgentCreation, createGenerationTask, deleteGenerationSession, listGenerationSessions, resolveAgentForm } from "./generation-api";
vi.mock("@/shared/api/browser-client", () => ({ browserApiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
beforeEach(() => {
  vi.clearAllMocks();
  for (const method of [browserApiClient.get, browserApiClient.post, browserApiClient.put])
    vi.mocked(method).mockResolvedValue({ data: { code: 0, message: "ok", data: [] } });
});
describe("creation REST contract", () => {
  it("deletes a session without a body and accepts an empty 204 response", async () => {
    vi.mocked(browserApiClient.delete).mockResolvedValue({ status: 204, data: "" });
    await expect(deleteGenerationSession("1")).resolves.toBeUndefined();
    expect(browserApiClient.delete).toHaveBeenCalledWith("/generation-sessions/1");
  });
  it("loads sessions without pagination", async () => {
    await listGenerationSessions(); expect(browserApiClient.get).toHaveBeenCalledWith("/generation-sessions");
  });
  it("uses one creation resource for both modes", async () => {
    await createGenerationTask({ prompt: "海报", aspectRatio: "3:4", imageCount: 1, promptExtend: true });
    await createAgentCreation({ sessionId: "1", prompt: "设计海报", inputAssetIds: ["9"], aspectRatio: "AUTO", imageCount: 0 });
    expect(browserApiClient.post).toHaveBeenNthCalledWith(1, "/creations", expect.objectContaining({ mode: "NORMAL",
      input: { prompt: "海报", assetIds: [] }, settings: expect.objectContaining({ aspectRatio: "3:4", imageCount: 1 }) }));
    expect(browserApiClient.post).toHaveBeenNthCalledWith(2, "/creations", expect.objectContaining({ mode: "AGENT", sessionId: "1",
      input: { prompt: "设计海报", assetIds: ["9"] }, settings: { aspectRatio: undefined, imageCount: undefined } }));
  });
  it("submits field values and execution revision", async () => {
    await resolveAgentForm({ creationId: "2", toolCallId: "call/1", expectedRevision: 3, action: "SUBMITTED",
      form: { schemaVersion: 2, title: "确认", fields: [{ id: "theme", label: "主题", type: "TEXT", required: true, value: "猫" }] } });
    expect(browserApiClient.put).toHaveBeenCalledWith("/creations/2/forms/call%2F1/response",
      { expectedRevision: 3, action: "SUBMITTED", values: { theme: "猫" } });
  });
});
