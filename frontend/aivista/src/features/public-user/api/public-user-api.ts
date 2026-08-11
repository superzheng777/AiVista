import type { UserId } from "@/entities/user/model/user";
import { browserApiClient } from "@/shared/api/browser-client";
import { type ApiResponse, unwrapApiResponse } from "@/shared/api/api-response";

export type PublicAuthor = { id: UserId; nickname: string; avatarUrl: string | null; bio: string | null; followerCount: number; followingCount: number; receivedLikeCount: number; likesPublic: boolean; viewerFollowing: boolean; viewerFollowedByAuthor: boolean };

export async function getPublicAuthor(userId: string): Promise<PublicAuthor> { const response = await browserApiClient.get<ApiResponse<PublicAuthor>>(`/users/${userId}`); return unwrapApiResponse(response.data); }
export async function setFollowing(userId: string, following: boolean): Promise<void> { if (following) await browserApiClient.put(`/users/${userId}/follow`); else await browserApiClient.delete(`/users/${userId}/follow`); }
