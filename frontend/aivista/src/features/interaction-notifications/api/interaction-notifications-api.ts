import type { CursorPage, GenerationAssetImageDto } from "@/entities/generation/model/generation";
import { mapGenerationAssetImage } from "@/entities/generation/model/generation";
import type { InteractionNotification } from "@/entities/notification/model/notification";
import { browserApiClient } from "@/shared/api/browser-client";
import { type ApiResponse, unwrapApiResponse } from "@/shared/api/api-response";

export const interactionNotificationQueryKeys = { list: ["interaction-notifications", "list"] as const };
type InteractionDto = { notificationId: string; eventType: InteractionNotification["eventType"]; actor: InteractionNotification["actor"]; image: GenerationAssetImageDto | null; readAt: string | null; createdAt: string };

export async function listInteractionNotifications(cursor: string | null): Promise<CursorPage<InteractionNotification>> { const response = await browserApiClient.get<ApiResponse<CursorPage<InteractionDto>>>("/users/me/interaction-notifications", { params: cursor ? { cursor } : undefined }); const page = unwrapApiResponse(response.data); return { items: page.items.map((item) => ({ ...item, id: item.notificationId, image: item.image ? mapGenerationAssetImage(item.image) : null })), nextCursor: page.nextCursor }; }
export async function markInteractionNotificationRead(id: string): Promise<void> { await browserApiClient.post(`/users/me/interaction-notifications/${id}/read`); }
export async function markAllInteractionNotificationsRead(): Promise<void> { await browserApiClient.post("/users/me/interaction-notifications/read-all"); }
export async function deleteInteractionNotification(id: string): Promise<void> { await browserApiClient.delete(`/users/me/interaction-notifications/${id}`); }
export async function deleteInteractionNotifications(ids: string[]): Promise<void> { await browserApiClient.post("/users/me/interaction-notifications/deletions", { notificationIds: ids }); }
