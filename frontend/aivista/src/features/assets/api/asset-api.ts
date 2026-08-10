import type { GenerationAsset } from "@/entities/generation/model/generation";
import { browserApiClient } from "@/shared/api/browser-client";
import { type ApiResponse, unwrapApiResponse } from "@/shared/api/api-response";

type GenerationAssetDto = {
  imageId: string;
  url: string;
  urlExpiresAt: string;
  createdAt: string;
  finalPrompt: string;
  finalNegativePrompt: string | null;
  generationConfig: { width: number; height: number; requestedImageCount: number; promptExtend: boolean };
  publicationReviewStatus: string;
  publicationVersion: number;
  publicAt: string | null;
  title: string | null;
  description: string | null;
};

export const assetQueryKeys = { all: ["assets"] as const };

function toAsset(dto: GenerationAssetDto): GenerationAsset {
  return {
    id: dto.imageId,
    url: dto.url,
    urlExpiresAt: dto.urlExpiresAt,
    width: dto.generationConfig.width,
    height: dto.generationConfig.height,
    createdAt: dto.createdAt,
    finalPrompt: dto.finalPrompt,
    finalNegativePrompt: dto.finalNegativePrompt,
    requestedImageCount: dto.generationConfig.requestedImageCount,
    promptExtend: dto.generationConfig.promptExtend,
    publicationReviewStatus: dto.publicationReviewStatus,
    publicationVersion: dto.publicationVersion,
    publicAt: dto.publicAt,
    title: dto.title,
    description: dto.description,
  };
}

export async function listGenerationAssets(): Promise<GenerationAsset[]> {
  const response = await browserApiClient.get<ApiResponse<GenerationAssetDto[]>>("/generation-images");
  return unwrapApiResponse(response.data).map(toAsset);
}

export async function deleteGenerationAssets(imageIds: string[]): Promise<void> {
  const response = await browserApiClient.post<ApiResponse<null>>("/generation-images/delete", { imageIds });
  unwrapApiResponse(response.data);
}
