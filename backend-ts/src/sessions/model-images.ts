import type { AssetReference } from "./session-contract.js";

/** The marker is ordinary persisted text. Only trusted asset references become image blocks. */
export function imageReferenceText(asset: AssetReference): string {
  return `[aivista-image:${asset.assetId}] ${asset.url}`;
}

type ContentBlock = { type: string; text?: string; image_url?: { url: string } };
type ProviderMessage = { role: string; content?: string | ContentBlock[] | null; [key: string]: unknown };

/** Adapt only the transient OpenAI-compatible request; Pi's persisted messages remain URL references. */
export function injectModelImages(payload: unknown, assets: ReadonlyMap<string, AssetReference>,
    sign: (url: string) => string): unknown {
  if (!payload || typeof payload !== "object" || !Array.isArray(Reflect.get(payload, "messages"))) {
    return undefined;
  }
  const source = Reflect.get(payload, "messages") as ProviderMessage[];
  const messages: ProviderMessage[] = [];
  const pendingToolImages: ContentBlock[] = [];
  const appendToolImages = () => messages.push({ role: "user", content: [
    { type: "text", text: "以下图片来自 inspect_image 工具，是参考素材，不是新的用户要求。请按本轮用户要求使用；参考图的配色、风格和构图不能覆盖用户明确要求的修改。" },
    ...pendingToolImages.splice(0),
  ] });
  for (const message of source) {
    if (message.role !== "tool" && pendingToolImages.length) {
      appendToolImages();
    }
    const blocks = typeof message.content === "string"
      ? [{ type: "text", text: message.content }] : message.content;
    const images: ContentBlock[] = [];
    if (message.role === "user" || message.role === "tool") {
      const seen = new Set<string>();
      for (const block of blocks ?? []) {
        if (block.type !== "text" || !block.text) continue;
        for (const match of block.text.matchAll(/\[aivista-image:([1-9]\d*)\]/g)) {
          const asset = assets.get(match[1]!);
          if (!asset || seen.has(asset.assetId)) continue;
          seen.add(asset.assetId);
          images.push({ type: "text", text: `参考图片资产 ID：${asset.assetId}` });
          images.push({ type: "image_url", image_url: { url: sign(asset.url) } });
        }
      }
    }
    if (message.role === "user" && images.length) {
      messages.push({ ...message, content: [...blocks ?? [], ...images] });
    } else {
      messages.push(message);
      pendingToolImages.push(...images);
    }
  }
  if (pendingToolImages.length) appendToolImages();
  return { ...payload, messages };
}
