import type { OfficialNotification, OfficialNotificationEventType, NotificationViolation } from "@/entities/notification/model/notification";
import { browserApiClient } from "@/shared/api/browser-client";
import { type ApiResponse, unwrapApiResponse } from "@/shared/api/api-response";

export const officialNotificationQueryKeys = {
  list: ["official-notifications", "list"] as const,
  unreadCount: ["official-notifications", "unread-count"] as const,
};

type OfficialNotificationDto = {
  notificationId: string;
  eventType: OfficialNotificationEventType;
  imageId: string | null;
  title: string;
  content: string;
  metadata: { violations?: NotificationViolation[] } | null;
  readAt: string | null;
  createdAt: string;
};

export async function listOfficialNotifications(): Promise<OfficialNotification[]> {
  const response = await browserApiClient.get<ApiResponse<OfficialNotificationDto[]>>("/users/me/official-notifications");
  return unwrapApiResponse(response.data).map(mapOfficialNotification);
}

export async function fetchOfficialNotificationUnreadCount(): Promise<number> {
  const response = await browserApiClient.get<ApiResponse<{ unreadCount: number }>>("/users/me/official-notifications/unread-count");
  return unwrapApiResponse(response.data).unreadCount;
}

export async function markOfficialNotificationRead(notificationId: string): Promise<void> {
  const response = await browserApiClient.post<ApiResponse<null>>(`/users/me/official-notifications/${notificationId}/read`);
  unwrapApiResponse(response.data);
}

export async function markAllOfficialNotificationsRead(): Promise<void> {
  const response = await browserApiClient.post<ApiResponse<null>>("/users/me/official-notifications/read-all");
  unwrapApiResponse(response.data);
}

export async function deleteOfficialNotification(notificationId: string): Promise<void> {
  const response = await browserApiClient.delete<ApiResponse<null>>(`/users/me/official-notifications/${notificationId}`);
  unwrapApiResponse(response.data);
}

export async function deleteAllOfficialNotifications(): Promise<void> {
  const response = await browserApiClient.delete<ApiResponse<null>>("/users/me/official-notifications");
  unwrapApiResponse(response.data);
}

function mapOfficialNotification(dto: OfficialNotificationDto): OfficialNotification {
  return {
    id: dto.notificationId,
    eventType: dto.eventType,
    imageId: dto.imageId,
    title: dto.title,
    content: dto.content,
    violations: dto.metadata?.violations ?? [],
    readAt: dto.readAt,
    createdAt: dto.createdAt,
  };
}
