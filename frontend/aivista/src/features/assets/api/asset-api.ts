import type { GenerationAsset, GenerationAssetImageDto, ImageUrl } from "@/entities/generation/model/generation";
import { mapGenerationAssetImage } from "@/entities/generation/model/generation";
import { browserApiClient } from "@/shared/api/browser-client";
import { type ApiResponse, unwrapApiResponse } from "@/shared/api/api-response";

export const assetQueryKeys = {
  all: ["assets"] as const,
};

export async function listGenerationAssets(): Promise<GenerationAsset[]> {
  const response = await browserApiClient.get<ApiResponse<GenerationAssetImageDto[]>>("/generation-images");
  return unwrapApiResponse(response.data).map(mapGenerationAssetImage);
}

export async function getGenerationAsset(imageId: string): Promise<GenerationAsset> {
  const response = await browserApiClient.get<ApiResponse<GenerationAssetImageDto>>(`/generation-images/${imageId}`);
  return mapGenerationAssetImage(unwrapApiResponse(response.data));
}

/** Requests a fresh 3-minute original-file URL. The backend verifies image ownership. */
export async function getOriginalGenerationImageDownloadUrl(imageId: string): Promise<ImageUrl> {
  const response = await browserApiClient.get<ApiResponse<ImageUrl>>(`/generation-images/${imageId}/original-download`);
  return unwrapApiResponse(response.data);
}

export async function deleteGenerationAssets(imageIds: string[]): Promise<void> {
  const response = await browserApiClient.post<ApiResponse<null>>("/generation-images/delete", { imageIds });
  unwrapApiResponse(response.data);
}

/** 将图片批量设置为收藏或未收藏；不是易产生竞态的“切换”操作。 */
export async function setGenerationImageFavorites(imageIds: string[], favorite: boolean): Promise<void> {
  const response = await browserApiClient.post<ApiResponse<null>>("/generation-images/favorites", { imageIds, favorite });
  unwrapApiResponse(response.data);
}
