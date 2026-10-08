import { needsImageUrlRefresh, type GenerationAsset } from "../model/generation";

export async function copyGenerationImage(
  image: GenerationAsset,
  refreshImage?: (imageId: string) => Promise<GenerationAsset>,
): Promise<void> {
  async function refresh(): Promise<GenerationAsset> {
    if (!refreshImage) throw new Error("Image refresh is unavailable");
    return refreshImage(image.id);
  }

  async function fetchImage(value: GenerationAsset): Promise<Blob> {
    const url = value.imageUrls.display?.url;
    if (!url) throw new Error("Display image URL is unavailable");
    const response = await fetch(url, { mode: "cors", referrerPolicy: "no-referrer" });
    if (!response.ok) throw new Error("Image request failed");
    return response.blob();
  }

  const refreshed = needsImageUrlRefresh(image.imageUrls.display);
  const imageToCopy = refreshed ? await refresh() : image;
  let blob: Blob;
  try {
    blob = await fetchImage(imageToCopy);
  } catch {
    if (refreshed) throw new Error("Image request failed after refresh");
    blob = await fetchImage(await refresh());
  }
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
    throw new Error("Image clipboard is unavailable");
  await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/webp"]: blob })]);
}
