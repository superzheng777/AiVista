import { browserApiClient } from "@/shared/api/browser-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchNotificationUnreadCount, notificationQueryKeys } from "./notification-api";

vi.mock("@/shared/api/browser-client", () => ({ browserApiClient: { get: vi.fn() } }));
const client = vi.mocked(browserApiClient);
beforeEach(() => vi.clearAllMocks());

describe("notification-api", () => {
  it("fetchNotificationUnreadCount 保留官方与互动未读数、端点与缓存键", async () => {
    const counts = { officialUnreadCount: 2, interactionUnreadCount: 1, totalUnreadCount: 3 };
    client.get.mockResolvedValue({ data: { code: 0, message: "ok", data: counts } });
    await expect(fetchNotificationUnreadCount()).resolves.toEqual(counts);
    expect(client.get).toHaveBeenCalledExactlyOnceWith("/users/me/notifications/unread-count");
    expect(notificationQueryKeys.unreadCount).toEqual(["notifications", "unread-count"]);
  });

  it("preserves request failures instead of replacing counts with zero", async () => {
    const error = new Error("unavailable");
    client.get.mockRejectedValue(error);
    await expect(fetchNotificationUnreadCount()).rejects.toBe(error);
    expect(client.get).toHaveBeenCalledTimes(1);
  });
});
