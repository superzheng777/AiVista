import type { GenerationAsset } from "@/entities/image-resource/model/image-resource";

export function deduplicate(images: GenerationAsset[]): GenerationAsset[] {
  const seen = new Set<string>();
  return images.filter((image) => {
    if (seen.has(image.id)) return false;
    seen.add(image.id);
    return true;
  });
}
