import { type ApiResponse, unwrapApiResponse } from "@/shared/api/api-response";
import { browserApiClient } from "@/shared/api/browser-client";

/** Combined counts shared by official and interaction notifications. */
export const notificationQueryKeys = {
  unreadCount: ["notifications", "unread-count"] as const,
};

export type NotificationUnreadCount = {
  officialUnreadCount: number;
  interactionUnreadCount: number;
  totalUnreadCount: number;
};

export async function fetchNotificationUnreadCount(): Promise<NotificationUnreadCount> {
  const response = await browserApiClient.get<ApiResponse<NotificationUnreadCount>>(
    "/users/me/notifications/unread-count",
  );
  return unwrapApiResponse(response.data);
}
