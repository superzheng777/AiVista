import { describe, expect, it } from "vitest";
import { imageReferenceText, injectModelImages } from "../src/sessions/model-images.js";

describe("URL image adapter", () => {
  const asset = { assetId: "12", url: "https://assets.example/users/1/input.png" };
  const assets = new Map([[asset.assetId, asset]]);
  const sign = (url: string) => `${url}?signature=fresh`;

  it("injects a signed image into the transient user request without mutating history", () => {
    const payload = { messages: [{ role: "user", content: imageReferenceText(asset) }] };
    const before = JSON.stringify(payload);
    expect(injectModelImages(payload, assets, sign)).toMatchObject({ messages: [{
      role: "user", content: [{ type: "text" }, { type: "text", text: "参考图片资产 ID：12" },
        { type: "image_url", image_url: { url: sign(asset.url) } }],
    }] });
    expect(JSON.stringify(payload)).toBe(before);
  });

  it("keeps parallel tool responses together before attaching inspected images", () => {
    const payload = { messages: [
      { role: "assistant", tool_calls: [{ id: "a" }, { id: "b" }] },
      { role: "tool", tool_call_id: "a", content: imageReferenceText(asset) },
      { role: "tool", tool_call_id: "b", content: "done" },
    ] };
    const result = injectModelImages(payload, assets, sign) as typeof payload;
    expect(result.messages.map((message) => message.role)).toEqual(["assistant", "tool", "tool", "user"]);
    expect(result.messages.at(-1)?.content).toEqual([
      { type: "text", text: expect.stringContaining("不是新的用户要求") },
      { type: "text", text: "参考图片资产 ID：12" },
      { type: "image_url", image_url: { url: sign(asset.url) } },
    ]);
  });

  it("never signs arbitrary URLs or unknown asset IDs supplied in text", () => {
    const payload = { messages: [{ role: "user", content: "https://evil.example/x [aivista-image:999]" }] };
    expect(injectModelImages(payload, assets, () => { throw new Error("Must not sign"); })).toEqual(payload);
  });
});
