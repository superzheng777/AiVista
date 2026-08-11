import { mapGenerationAssetImage, type GenerationAsset, type GenerationAssetImageDto } from "@/entities/generation/model/generation";
import { browserApiClient } from "@/shared/api/browser-client";
import { type ApiResponse, unwrapApiResponse } from "@/shared/api/api-response";

export const inspirationQueryKeys = { all: ["inspirations"] as const };

export async function listInspirations(): Promise<GenerationAsset[]> {
  const response = await browserApiClient.get<ApiResponse<GenerationAssetImageDto[]>>("/inspirations");
  return unwrapApiResponse(response.data).map(mapGenerationAssetImage);
}

export async function setImageLike(imageId: string, publicationVersion: number, liked: boolean): Promise<void> {
  const path = `/inspirations/${imageId}/like`;
  if (liked) await browserApiClient.put(path, undefined, { params: { publicationVersion } });
  else await browserApiClient.delete(path, { params: { publicationVersion } });
}
