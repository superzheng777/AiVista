import { useAuthStore } from "@/features/auth/model/auth-store";
import { getPublicAuthor, listLikedPublications, type PublicAuthor } from "@/features/public-user/api/public-user-api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserProfilePage } from "./user-profile-page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/features/public-user/api/public-user-api", async (original) => ({
  ...(await original<typeof import("@/features/public-user/api/public-user-api")>()),
  getPublicAuthor: vi.fn(),
  listPublications: vi.fn().mockResolvedValue([]),
  listLikedPublications: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/features/publication/api/publication-api", async (original) => ({
  ...(await original<typeof import("@/features/publication/api/publication-api")>()),
  listMyPublications: vi.fn().mockResolvedValue([]),
}));
const author: PublicAuthor = {
  id: "self",
  nickname: "原昵称",
  bio: "原简介",
  avatarUrl: null,
  followerCount: 0,
  followingCount: 0,
  receivedLikeCount: 0,
  likesPublic: false,
  viewerFollowing: false,
  viewerFollowedByAuthor: false,
};
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.mocked(getPublicAuthor).mockResolvedValue(author);
  useAuthStore.setState(
    {
      ...useAuthStore.getInitialState(),
      status: "authenticated",
      user: {
        id: "self",
        nickname: "原昵称",
        bio: "原简介",
        avatarUrl: null,
        loginName: "test",
        createdAt: "",
        updatedAt: "",
      },
    },
    true,
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  useAuthStore.setState(useAuthStore.getInitialState(), true);
});
const mount = (userId: string) =>
  render(
    <QueryClientProvider client={client}>
      <UserProfilePage userId={userId} />
    </QueryClientProvider>,
  );

describe("UserProfilePage state boundaries", () => {
  it("discards an unsaved edit when the edit form is closed and reopened", async () => {
    mount("self");
    fireEvent.click(await screen.findByRole("button", { name: "编辑资料" }));
    fireEvent.change(screen.getByRole("textbox", { name: "昵称" }), { target: { value: "未保存" } });
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("textbox", { name: "昵称" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "编辑资料" }));
    expect(screen.getByRole("textbox", { name: "昵称" })).toHaveValue("原昵称");
    expect(screen.getByRole("textbox", { name: "个人简介" })).toHaveValue("原简介");
  });
  it("does not fetch private likes for visitors, and uses the self endpoint when the owner opens likes", async () => {
    const view = mount("other");
    await screen.findByRole("heading", { name: "原昵称" });
    expect(screen.queryByRole("tab", { name: "点赞" })).not.toBeInTheDocument();
    expect(listLikedPublications).not.toHaveBeenCalled();
    view.rerender(
      <QueryClientProvider client={client}>
        <UserProfilePage userId="self" />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "点赞" }));
    await waitFor(() => expect(listLikedPublications).toHaveBeenCalledWith("self", true));
  });
});
