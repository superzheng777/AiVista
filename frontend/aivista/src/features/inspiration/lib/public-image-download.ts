import { needsImageUrlRefresh, type GenerationAsset } from "@/entities/generation/model/generation";

async function fetchDisplayImage(image: GenerationAsset): Promise<Response> {
  const url = image.imageUrls.display?.url;
  if (!url) throw new Error("Public display image is unavailable");
  return fetch(url, { mode: "cors", referrerPolicy: "no-referrer" });
}

/** Downloads only the already-public display rendition; original files remain owner-only. */
export async function downloadPublicDisplayImage(
  image: GenerationAsset,
  refreshImage: (imageId: string) => Promise<GenerationAsset>,
): Promise<void> {
  let current = image;
  let refreshed = false;

  if (needsImageUrlRefresh(current.imageUrls.display)) {
    current = await refreshImage(image.id);
    refreshed = true;
  }

  let response = await fetchDisplayImage(current);
  if (!response.ok && !refreshed) {
    current = await refreshImage(image.id);
    response = await fetchDisplayImage(current);
  }
  if (!response.ok) throw new Error("Public display image download failed");

  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `aivista-${image.id}.webp`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
