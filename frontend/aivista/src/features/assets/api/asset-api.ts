import type { GenerationAsset, GenerationAssetImageDto } from "@/entities/generation/model/generation";
import { mapGenerationAssetImage } from "@/entities/generation/model/generation";
import { browserApiClient } from "@/shared/api/browser-client";
import { type ApiResponse, unwrapApiResponse } from "@/shared/api/api-response";

export const assetQueryKeys = { all: ["assets"] as const };

export async function listGenerationAssets(): Promise<GenerationAsset[]> {
  const response = await browserApiClient.get<ApiResponse<GenerationAssetImageDto[]>>("/generation-images");
  return unwrapApiResponse(response.data).map(mapGenerationAssetImage);
}

export async function getGenerationAsset(imageId: string): Promise<GenerationAsset> {
  const response = await browserApiClient.get<ApiResponse<GenerationAssetImageDto>>(`/generation-images/${imageId}`);
  return mapGenerationAssetImage(unwrapApiResponse(response.data));
}

export async function deleteGenerationAssets(imageIds: string[]): Promise<void> {
  const response = await browserApiClient.post<ApiResponse<null>>("/generation-images/delete", { imageIds });
  unwrapApiResponse(response.data);
}
