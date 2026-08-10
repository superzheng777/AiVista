import type { GenerationAsset, GenerationAssetImageDto } from "@/entities/generation/model/generation";
import { mapGenerationAssetImage } from "@/entities/generation/model/generation";
import { browserApiClient } from "@/shared/api/browser-client";
import { type ApiResponse, unwrapApiResponse } from "@/shared/api/api-response";

type PublicationRequestDto = { imageId: string; status: string };

export const publicationQueryKeys = {
  mine: ["publication", "mine"] as const,
};

export type SubmitPublicationInput = { title: string; description: string };

export async function submitPublication(imageId: string, input: SubmitPublicationInput, idempotencyKey: string): Promise<{ imageId: string; status: string }> {
  const response = await browserApiClient.post<ApiResponse<PublicationRequestDto>>(
    `/generation-images/${imageId}/publication`,
    input,
    { headers: { "Idempotency-Key": idempotencyKey } },
  );
  return unwrapApiResponse(response.data);
}

export async function removePublication(imageId: string): Promise<void> {
  const response = await browserApiClient.delete<ApiResponse<null>>(`/generation-images/${imageId}/publication`);
  unwrapApiResponse(response.data);
}

export async function listMyPublications(): Promise<GenerationAsset[]> {
  const response = await browserApiClient.get<ApiResponse<GenerationAssetImageDto[]>>("/users/me/publications");
  return unwrapApiResponse(response.data).map(mapGenerationAssetImage);
}
