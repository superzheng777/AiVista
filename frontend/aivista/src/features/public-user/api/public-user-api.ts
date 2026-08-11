import type { UserId } from "@/entities/user/model/user";
import type { GenerationAsset, GenerationAssetImageDto } from "@/entities/generation/model/generation";
import { mapGenerationAssetImage } from "@/entities/generation/model/generation";
import { browserApiClient } from "@/shared/api/browser-client";
import { type ApiResponse, unwrapApiResponse } from "@/shared/api/api-response";

export type PublicAuthor = { id: UserId; nickname: string; avatarUrl: string | null; bio: string | null; followerCount: number; followingCount: number; receivedLikeCount: number; likesPublic: boolean; viewerFollowing: boolean; viewerFollowedByAuthor: boolean };

export async function getPublicAuthor(userId: string): Promise<PublicAuthor> { const response = await browserApiClient.get<ApiResponse<PublicAuthor>>(`/users/${userId}`); return unwrapApiResponse(response.data); }
export async function setFollowing(userId: string, following: boolean): Promise<void> { if (following) await browserApiClient.put(`/users/${userId}/follow`); else await browserApiClient.delete(`/users/${userId}/follow`); }
type LikedDto = { image: GenerationAssetImageDto; likedAt: string };
export async function listPublications(userId: string): Promise<GenerationAsset[]> { const response = await browserApiClient.get<ApiResponse<GenerationAssetImageDto[]>>(`/users/${userId}/publications`); return unwrapApiResponse(response.data).map(mapGenerationAssetImage); }
export async function listLikedPublications(userId: string, isSelf: boolean): Promise<GenerationAsset[]> { const response = await browserApiClient.get<ApiResponse<LikedDto[]>>(isSelf ? "/users/me/liked-publications" : `/users/${userId}/liked-publications`); return unwrapApiResponse(response.data).map((item) => mapGenerationAssetImage(item.image)); }
export async function setLikedPublicationsVisibility(publicVisible: boolean): Promise<void> { await browserApiClient.put("/users/me/liked-publications-visibility", { publicVisible }); }
