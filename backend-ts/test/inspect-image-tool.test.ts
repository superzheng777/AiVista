import { describe, expect, it, vi } from "vitest";
import { Value } from "typebox/value";
import { JavaGenerationApiError } from "../src/agent/adapters/java-generation-client.js";
import { createInspectImageTool } from "../src/agent/tools/index.js";

describe("inspect_image Tool", () => {
  it("defines a strict Asset ID schema and returns model-visible ImageContent", async () => {
    const inspect = vi.fn().mockResolvedValue({
      assetId: "701",
      image: { type: "image", data: "AQI=", mimeType: "image/webp" },
    });
    const tool = createInspectImageTool({ inspect });

    expect(tool.name).toBe("inspect_image");
    expect(Value.Check(tool.parameters, { assetId: "701" })).toBe(true);
    expect(Value.Check(tool.parameters, { assetId: "../secret" })).toBe(false);
    const result = await tool.execute("call-inspect", { assetId: "701" }, undefined, undefined, {} as never);

    expect(inspect).toHaveBeenCalledWith("701", undefined);
    expect(result.content).toEqual([
      { type: "text", text: "[已读取图片 Asset ID: 701]" },
      { type: "image", data: "AQI=", mimeType: "image/webp" },
    ]);
    expect(result.details).toEqual({ outcome: "SUCCEEDED", assetId: "701" });
  });

  it("turns authorization failures into a safe result the model can act on", async () => {
    const tool = createInspectImageTool({
      inspect: vi.fn().mockRejectedValue(new JavaGenerationApiError(403, 40301, "internal")),
    });

    const result = await tool.execute("call-inspect", { assetId: "999" }, undefined, undefined, {} as never);

    expect(result.details).toMatchObject({ outcome: "FAILED", assetId: "999",
      code: "IMAGE_NOT_AVAILABLE", retryable: true });
    expect(JSON.stringify(result)).not.toContain("internal");
  });
});
