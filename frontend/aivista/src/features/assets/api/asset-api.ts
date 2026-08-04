import type { CursorPage, GenerationAsset } from "@/entities/generation/model/generation";
import { browserApiClient } from "@/shared/api/browser-client";
import { type ApiResponse, unwrapApiResponse } from "@/shared/api/api-response";

type GenerationAssetDto = { imageId: string; url: string; urlExpiresAt: string; width: number; height: number; createdAt: string; finalPrompt: string; finalNegativePrompt: string | null; requestedImageCount: number };

export const assetQueryKeys = { all: ["assets"] as const, pages: () => [...assetQueryKeys.all, "pages"] as const };

function toAsset(dto: GenerationAssetDto): GenerationAsset { return { id: dto.imageId, url: dto.url, urlExpiresAt: dto.urlExpiresAt, width: dto.width, height: dto.height, createdAt: dto.createdAt, finalPrompt: dto.finalPrompt, finalNegativePrompt: dto.finalNegativePrompt, requestedImageCount: dto.requestedImageCount }; }

export async function listGenerationAssets(cursor?: string, limit = 36): Promise<CursorPage<GenerationAsset>> { const response = await browserApiClient.get<ApiResponse<{ items: GenerationAssetDto[]; nextCursor: string | null }>>("/generation-images", { params: { cursor, limit } }); const data = unwrapApiResponse(response.data); return { items: data.items.map(toAsset), nextCursor: data.nextCursor }; }
export async function deleteGenerationAssets(imageIds: string[]): Promise<void> { const response = await browserApiClient.post<ApiResponse<null>>("/generation-images/delete", { imageIds }); unwrapApiResponse(response.data); }
