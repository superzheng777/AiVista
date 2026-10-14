import type { GenerationAssetImageDto } from "@/entities/image-resource/model/image-resource";
import { mapGenerationAssetImage } from "@/entities/image-resource/model/image-resource";
import type {
  NotificationViolation,
  OfficialNotification,
  OfficialNotificationEventType,
} from "@/entities/notification/model/notification";
import { type ApiResponse, unwrapApiResponse } from "@/shared/api/api-response";
import { browserApiClient } from "@/shared/api/browser-client";
import type { CursorPage } from "@/shared/api/cursor-page";

export const officialNotificationQueryKeys = {
  list: ["official-notifications", "list"] as const,
};

type OfficialNotificationDto = {
  notificationId: string;
  eventType: OfficialNotificationEventType;
  title: string;
  content: string;
  metadata: { violations?: NotificationViolation[] } | null;
  image: GenerationAssetImageDto | null;
  readAt: string | null;
  createdAt: string;
};

export async function listOfficialNotifications(cursor: string | null): Promise<CursorPage<OfficialNotification>> {
  const response = await browserApiClient.get<ApiResponse<CursorPage<OfficialNotificationDto>>>(
    "/users/me/official-notifications",
    {
      params: cursor ? { cursor } : undefined,
    },
  );
  const page = unwrapApiResponse(response.data);
  return { items: page.items.map(mapOfficialNotification), nextCursor: page.nextCursor };
}

export async function markOfficialNotificationRead(notificationId: string): Promise<void> {
  await browserApiClient.post(`/users/me/official-notifications/${notificationId}/read`);
}

export async function markAllOfficialNotificationsRead(): Promise<void> {
  await browserApiClient.post("/users/me/official-notifications/read-all");
}

export async function deleteOfficialNotification(notificationId: string): Promise<void> {
  await browserApiClient.delete(`/users/me/official-notifications/${notificationId}`);
}

export async function deleteOfficialNotifications(notificationIds: string[]): Promise<void> {
  await browserApiClient.post("/users/me/official-notifications/deletions", { notificationIds });
}

function mapOfficialNotification(dto: OfficialNotificationDto): OfficialNotification {
  return {
    id: dto.notificationId,
    eventType: dto.eventType,
    image: dto.image ? mapGenerationAssetImage(dto.image) : null,
    title: dto.title,
    content: dto.content,
    violations: dto.metadata?.violations ?? [],
    readAt: dto.readAt,
    createdAt: dto.createdAt,
  };
}
