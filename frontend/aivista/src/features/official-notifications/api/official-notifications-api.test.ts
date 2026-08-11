import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/browser-client", () => ({
  browserApiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

import { browserApiClient } from "@/shared/api/browser-client";
import {
  fetchOfficialNotificationUnreadCount,
  deleteOfficialNotifications,
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
    client.get.mockResolvedValue(responseData({ items: [
      {
        notificationId: "n1",
        eventType: "PUBLICATION_REJECTED",
        image: { imageId: "img-1", url: "https://example.com/image", urlExpiresAt: "2026-08-10T01:00:00Z", createdAt: "2026-08-10T00:00:00Z", favorited: false, finalPrompt: "prompt", finalNegativePrompt: null, generationConfig: { width: 1, height: 1, requestedImageCount: 1, promptExtend: false }, publicationReviewStatus: "APPROVED", publicationVersion: 1, publicAt: null, title: null, description: null, authorId: "user-1", likeCount: 0, likedByCurrentUser: false },
        title: "标题",
        content: "正文",
        metadata: { violations: [{ field: "title", reasonCode: "SENSITIVE_INFO" }] },
        readAt: null,
        createdAt: "2026-08-10T00:00:00Z",
      },
      {
        notificationId: "n2",
        eventType: "PUBLICATION_APPROVED",
        image: null,
        title: "标题2",
        content: "正文2",
        metadata: null,
        readAt: "2026-08-10T01:00:00Z",
        createdAt: "2026-08-10T00:30:00Z",
      },
    ], nextCursor: null }));

    const result = await listOfficialNotifications(null);
    expect(client.get).toHaveBeenCalledWith("/users/me/official-notifications", { params: undefined });
    expect(result.items).toEqual([
      {
        id: "n1",
        eventType: "PUBLICATION_REJECTED",
        image: expect.objectContaining({ id: "img-1" }),
        title: "标题",
        content: "正文",
        violations: [{ field: "title", reasonCode: "SENSITIVE_INFO" }],
        readAt: null,
        createdAt: "2026-08-10T00:00:00Z",
      },
      {
        id: "n2",
        eventType: "PUBLICATION_APPROVED",
        image: null,
        title: "标题2",
        content: "正文2",
        violations: [],
        readAt: "2026-08-10T01:00:00Z",
        createdAt: "2026-08-10T00:30:00Z",
      },
    ]);
    expect(result.nextCursor).toBeNull();
  });

  it("fetchOfficialNotificationUnreadCount 返回未读数", async () => {
    client.get.mockResolvedValue(responseData({ officialUnreadCount: 3 }));
    await expect(fetchOfficialNotificationUnreadCount()).resolves.toBe(3);
    expect(client.get).toHaveBeenCalledWith("/users/me/notifications/unread-count");
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
    await deleteOfficialNotifications(["n1", "n2"]);

    expect(client.post).toHaveBeenCalledWith("/users/me/official-notifications/read-all");
    expect(client.delete).toHaveBeenCalledWith("/users/me/official-notifications/n1");
    expect(client.post).toHaveBeenCalledWith("/users/me/official-notifications/deletions", { notificationIds: ["n1", "n2"] });
  });
});
