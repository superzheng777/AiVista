import { mapGenerationAssetImage, type GenerationAsset, type GenerationAssetImageDto } from "@/entities/generation/model/generation";
import { browserApiClient } from "@/shared/api/browser-client";
import { type ApiResponse, unwrapApiResponse } from "@/shared/api/api-response";

export const inspirationQueryKeys = {
  all: ["inspirations"] as const,
  discovery: ["inspirations", "discovery"] as const,
  following: ["inspirations", "following"] as const,
  search: (keyword: string) => ["inspirations", "search", keyword] as const,
};
export type InspirationPage = { items: GenerationAsset[]; nextCursor: string | null };
export type InspirationSearchPage = { items: GenerationAsset[]; nextOffset: number | null };

export async function listInspirations(cursor: string | null): Promise<InspirationPage> {
  const response = await browserApiClient.get<ApiResponse<{ items: GenerationAssetImageDto[]; nextCursor: string | null }>>("/inspirations", { params: cursor ? { cursor } : undefined });
  const page = unwrapApiResponse(response.data);
  return { items: page.items.map(mapGenerationAssetImage), nextCursor: page.nextCursor };
}

export async function listFollowingInspirations(cursor: string | null): Promise<InspirationPage> {
  const response = await browserApiClient.get<ApiResponse<{ items: GenerationAssetImageDto[]; nextCursor: string | null }>>("/inspirations/following", { params: cursor ? { cursor } : undefined });
  const page = unwrapApiResponse(response.data);
  return { items: page.items.map(mapGenerationAssetImage), nextCursor: page.nextCursor };
}

export async function searchInspirations(keyword: string, offset: number | null): Promise<InspirationSearchPage> {
  const response = await browserApiClient.get<ApiResponse<{ items: GenerationAssetImageDto[]; nextOffset: number | null }>>(
    "/inspirations/search",
    { params: offset === null ? { q: keyword } : { q: keyword, offset } },
  );
  const page = unwrapApiResponse(response.data);
  return { items: page.items.map(mapGenerationAssetImage), nextOffset: page.nextOffset };
}

export async function getInspiration(imageId: string): Promise<GenerationAsset> {
  const response = await browserApiClient.get<ApiResponse<GenerationAssetImageDto>>(`/inspirations/${imageId}`);
  return mapGenerationAssetImage(unwrapApiResponse(response.data));
}

export async function setImageLike(imageId: string, publicationVersion: number, liked: boolean): Promise<void> {
  const path = `/inspirations/${imageId}/like`;
  if (liked) await browserApiClient.put(path, undefined, { params: { publicationVersion } });
  else await browserApiClient.delete(path, { params: { publicationVersion } });
}
