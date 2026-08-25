import type { GenerationAsset } from "@/entities/generation/model/generation";
import { getOriginalGenerationImageDownloadUrl } from "@/features/assets/api/asset-api";

/**
 * Original files are never part of normal image payloads. Ask the owner-only
 * endpoint for a new URL immediately before downloading, and retry once when a
 * just-issued signed URL cannot be fetched.
 */
export async function downloadOriginalGenerationImage(asset: Pick<GenerationAsset, "id">): Promise<void> {
  let downloadUrl = await getOriginalGenerationImageDownloadUrl(asset.id);
  let response = await fetch(downloadUrl.url, { mode: "cors", referrerPolicy: "no-referrer" });
  if (!response.ok) {
    downloadUrl = await getOriginalGenerationImageDownloadUrl(asset.id);
    response = await fetch(downloadUrl.url, { mode: "cors", referrerPolicy: "no-referrer" });
  }
  if (!response.ok) throw new Error("Original image download failed");

  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `aivista-${asset.id}.png`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
