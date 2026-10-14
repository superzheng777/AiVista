import type { OfficialNotification } from "@/entities/notification/model/notification";
import { useUserEventStreamStore } from "@/entities/user-event-stream/model/user-event-stream-store";
import {
  listInteractionNotifications,
  markInteractionNotificationRead,
} from "@/features/interaction-notifications/api/interaction-notifications-api";
import { fetchNotificationUnreadCount, notificationQueryKeys } from "@/features/notifications/api/notification-api";
import {
  listOfficialNotifications,
  markOfficialNotificationRead,
} from "@/features/official-notifications/api/official-notifications-api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationCenter } from "./notification-center";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/official-notifications/api/official-notifications-api", async (original) => ({
  ...(await original<typeof import("@/features/official-notifications/api/official-notifications-api")>()),
  listOfficialNotifications: vi.fn(),
  markOfficialNotificationRead: vi.fn(),
}));
vi.mock("@/features/notifications/api/notification-api", async (original) => ({
  ...(await original<typeof import("@/features/notifications/api/notification-api")>()),
  fetchNotificationUnreadCount: vi.fn(),
}));
vi.mock("@/features/interaction-notifications/api/interaction-notifications-api", async (original) => ({
  ...(await original<typeof import("@/features/interaction-notifications/api/interaction-notifications-api")>()),
  listInteractionNotifications: vi.fn(),
  markInteractionNotificationRead: vi.fn(),
}));
const message: OfficialNotification = {
  id: "notice-1",
  eventType: "PUBLICATION_APPROVED",
  image: null,
  title: "作品已通过",
  content: "审核完成",
  violations: [],
  readAt: null,
  createdAt: "2026-10-13T00:00:00Z",
};
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useUserEventStreamStore.setState(useUserEventStreamStore.getInitialState(), true);
  vi.mocked(fetchNotificationUnreadCount).mockResolvedValue({
    officialUnreadCount: 1,
    interactionUnreadCount: 0,
    totalUnreadCount: 1,
  });
  vi.mocked(listOfficialNotifications).mockResolvedValue({ items: [message], nextCursor: null });
  vi.mocked(listInteractionNotifications).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(markOfficialNotificationRead).mockResolvedValue(undefined);
  vi.mocked(markInteractionNotificationRead).mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  client.clear();
});
describe("NotificationCenter list lifetime", () => {
  it.each(["official", "interaction"] as const)(
    "refreshes the shared unread query only after a %s message is marked read",
    async (category) => {
      const official = category === "official";
      const counts = {
        officialUnreadCount: official ? 1 : 0,
        interactionUnreadCount: official ? 0 : 1,
        totalUnreadCount: 1,
      };
      const cleared = { officialUnreadCount: 0, interactionUnreadCount: 0, totalUnreadCount: 0 };
      vi.mocked(fetchNotificationUnreadCount).mockResolvedValueOnce(counts).mockResolvedValue(cleared);
      vi.mocked(listInteractionNotifications).mockResolvedValue({
        items: [
          {
            id: "interaction-1",
            eventType: "USER_FOLLOWED",
            actor: { userId: "other", nickname: "访客", avatarUrl: null },
            image: null,
            readAt: null,
            createdAt: "2026-10-13T00:00:00Z",
          },
        ],
        nextCursor: null,
      });
      const markRead = official ? markOfficialNotificationRead : markInteractionNotificationRead;
      const list = official ? listOfficialNotifications : listInteractionNotifications;
      const otherList = official ? listInteractionNotifications : listOfficialNotifications;
      let finish!: () => void;
      vi.mocked(markRead).mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      render(
        <QueryClientProvider client={client}>
          <NotificationCenter />
        </QueryClientProvider>,
      );
      await screen.findByText("1");
      expect(list).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "消息中心" }));
      const content = await screen.findByText(official ? "作品已通过" : "访客");
      expect(markRead).not.toHaveBeenCalled();
      expect(fetchNotificationUnreadCount).toHaveBeenCalledTimes(1);
      fireEvent.click(content);
      await waitFor(() =>
        expect(markRead).toHaveBeenCalledWith(official ? "notice-1" : "interaction-1", expect.anything()),
      );
      expect(client.getQueryData(notificationQueryKeys.unreadCount)).toEqual(counts);
      expect(fetchNotificationUnreadCount).toHaveBeenCalledTimes(1);
      await act(async () => finish());
      await waitFor(() => expect(client.getQueryData(notificationQueryKeys.unreadCount)).toEqual(cleared));
      expect(fetchNotificationUnreadCount).toHaveBeenCalledTimes(2);
      expect(list).toHaveBeenCalledTimes(2);
      expect(otherList).not.toHaveBeenCalled();
      expect(client.getQueryCache().findAll({ queryKey: ["notifications", "unread-count"] })).toHaveLength(1);
    },
  );

  it.each(["notificationRefreshVersion", "publicationRefreshVersion"] as const)(
    "refreshes only unread counts for %s while the center is closed",
    async (version) => {
      render(
        <QueryClientProvider client={client}>
          <NotificationCenter />
        </QueryClientProvider>,
      );
      await screen.findByText("1");
      act(() => useUserEventStreamStore.setState({ [version]: 1 }));
      await waitFor(() => expect(fetchNotificationUnreadCount).toHaveBeenCalledTimes(2));
      expect(listOfficialNotifications).not.toHaveBeenCalled();
      expect(listInteractionNotifications).not.toHaveBeenCalled();
    },
  );

  it("selects the official tab from unread counts and resets management after switching tabs", async () => {
    render(
      <QueryClientProvider client={client}>
        <NotificationCenter />
      </QueryClientProvider>,
    );
    await screen.findByText("1");
    expect(listOfficialNotifications).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "消息中心" }));
    await screen.findByText("作品已通过");
    fireEvent.click(screen.getByRole("button", { name: "管理" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "选择消息 notice-1" }));
    expect(screen.getByRole("button", { name: "删除已选 1 条" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "互动" }));
    await screen.findByText("暂无消息");
    fireEvent.click(screen.getByRole("button", { name: "官方" }));
    await screen.findByText("作品已通过");
    expect(screen.getByRole("button", { name: "管理" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除已选 1 条" })).not.toBeInTheDocument();
  });
});
