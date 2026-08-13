import { cache } from "react";

import { mapGenerationAssetImage, type GenerationAsset, type GenerationAssetImageDto } from "@/entities/generation/model/generation";
import type { ApiResponse } from "@/shared/api/api-response";

export const getPublicInspiration = cache(async (imageId: string): Promise<GenerationAsset | null> => {
  const backendOrigin = process.env.BACKEND_ORIGIN ?? "http://localhost:8888";
  const response = await fetch(`${backendOrigin}/api/inspirations/${encodeURIComponent(imageId)}`, { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Unable to load public inspiration.");
  const body = await response.json() as ApiResponse<GenerationAssetImageDto>;
  return body.code === 0 ? mapGenerationAssetImage(body.data) : null;
});
