import type { GenerationAsset, GenerationAssetImageDto } from "@/entities/generation/model/generation";
import { mapGenerationAssetImage } from "@/entities/generation/model/generation";
import { browserApiClient } from "@/shared/api/browser-client";
import { type ApiResponse, unwrapApiResponse } from "@/shared/api/api-response";

export type PublicationRequestResult = { imageId: string; status: "PENDING" };

export const publicationQueryKeys = {
  mine: ["publication", "mine"] as const,
};

export type SubmitPublicationInput = { title: string; description: string };

export async function submitPublication(imageId: string, input: SubmitPublicationInput): Promise<PublicationRequestResult> {
  const response = await browserApiClient.post<ApiResponse<PublicationRequestResult>>(
    `/generation-images/${imageId}/publication`,
    input,
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
