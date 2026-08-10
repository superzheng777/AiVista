import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/browser-client", () => ({
  browserApiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

import { browserApiClient } from "@/shared/api/browser-client";
import {
  fetchOfficialNotificationUnreadCount,
  deleteAllOfficialNotifications,
  deleteOfficialNotification,
  listOfficialNotifications,
  markAllOfficialNotificationsRead,
  markOfficialNotificationRead,
} from "@/features/official-notifications/api/official-notifications-api";

const client = vi.mocked(browserApiClient);
const okEnvelope = { code: 0, message: "ok" } as const;

function responseData<T>(data: T): never {
  return { data: { ...okEnvelope, data } } as never;
}

describe("official-notifications-api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listOfficialNotifications 映射 DTO 到实体（metadata 缺省为空违规）", async () => {
    client.get.mockResolvedValue(responseData([
      {
        notificationId: "n1",
        eventType: "PUBLICATION_REJECTED",
        imageId: "img-1",
        title: "标题",
        content: "正文",
        metadata: { violations: [{ field: "title", reasonCode: "SENSITIVE_INFO" }] },
        readAt: null,
        createdAt: "2026-08-10T00:00:00Z",
      },
      {
        notificationId: "n2",
        eventType: "PUBLICATION_APPROVED",
        imageId: null,
        title: "标题2",
        content: "正文2",
        metadata: null,
        readAt: "2026-08-10T01:00:00Z",
        createdAt: "2026-08-10T00:30:00Z",
      },
    ]));

    const result = await listOfficialNotifications();
    expect(client.get).toHaveBeenCalledWith("/users/me/official-notifications");
    expect(result).toEqual([
      {
        id: "n1",
        eventType: "PUBLICATION_REJECTED",
        imageId: "img-1",
        title: "标题",
        content: "正文",
        violations: [{ field: "title", reasonCode: "SENSITIVE_INFO" }],
        readAt: null,
        createdAt: "2026-08-10T00:00:00Z",
      },
      {
        id: "n2",
        eventType: "PUBLICATION_APPROVED",
        imageId: null,
        title: "标题2",
        content: "正文2",
        violations: [],
        readAt: "2026-08-10T01:00:00Z",
        createdAt: "2026-08-10T00:30:00Z",
      },
    ]);
  });

  it("fetchOfficialNotificationUnreadCount 返回未读数", async () => {
    client.get.mockResolvedValue(responseData({ unreadCount: 3 }));
    await expect(fetchOfficialNotificationUnreadCount()).resolves.toBe(3);
    expect(client.get).toHaveBeenCalledWith("/users/me/official-notifications/unread-count");
  });

  it("markOfficialNotificationRead 调用标记已读端点", async () => {
    client.post.mockResolvedValue(responseData(null));
    await markOfficialNotificationRead("n1");
    expect(client.post).toHaveBeenCalledWith("/users/me/official-notifications/n1/read");
  });

  it("批量已读与删除操作调用对应端点", async () => {
    client.post.mockResolvedValue(responseData(null));
    client.delete.mockResolvedValue(responseData(null));

    await markAllOfficialNotificationsRead();
    await deleteOfficialNotification("n1");
    await deleteAllOfficialNotifications();

    expect(client.post).toHaveBeenCalledWith("/users/me/official-notifications/read-all");
    expect(client.delete).toHaveBeenCalledWith("/users/me/official-notifications/n1");
    expect(client.delete).toHaveBeenCalledWith("/users/me/official-notifications");
  });
});
