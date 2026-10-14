import type { GenerationAsset } from "@/entities/image-resource/model/image-resource";
import type { PublicAuthor } from "@/features/public-user/api/public-user-api";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PublicDetailHeader } from "./public-detail-header";

vi.mock("@/features/auth/model/auth-dialog-store", () => ({
  useAuthDialogStore: (select: (state: { open: () => void }) => unknown) => select({ open: vi.fn() }),
}));

vi.mock("@/features/auth/model/auth-store", () => ({
  useAuthStore: (select: (state: { status: string; user: null }) => unknown) =>
    select({ status: "anonymous", user: null }),
}));

const author: PublicAuthor = {
  id: "12" as PublicAuthor["id"],
  nickname: "林风",
  avatarUrl: "https://cdn.example/avatar.png",
  bio: null,
  followerCount: 3,
  followingCount: 2,
  receivedLikeCount: 8,
  likesPublic: false,
  viewerFollowing: false,
  viewerFollowedByAuthor: false,
};

const image: GenerationAsset = {
  id: "image-1",
  sourceIndex: 0,
  imageUrls: { thumbnail: null, display: null },
  width: 1024,
  height: 1024,
  createdAt: "2026-06-21T00:00:00Z",
  favorited: false,
  finalPrompt: "prompt",
  finalNegativePrompt: null,
  requestedImageCount: 1,
  promptExtend: true,
  publicationReviewStatus: "APPROVED",
  publicationVersion: 1,
  publicAt: "2026-06-22T03:00:00Z",
  title: "作品",
  description: null,
  authorId: "12",
  likeCount: 148,
  likedByCurrentUser: false,
};

function renderHeader(isSelf: boolean) {
  const callbacks = {
    onFollow: vi.fn(),
    onLike: vi.fn(),
    onDownload: vi.fn(),
    onWithdraw: vi.fn(),
  };
  render(
    <PublicDetailHeader
      image={image}
      author={author}
      authorLoading={false}
      isSelf={isSelf}
      following={false}
      liking={false}
      downloading={false}
      withdrawing={false}
      likeError={null}
      downloadError={false}
      withdrawError={false}
      {...callbacks}
    />,
  );
  return callbacks;
}

describe("PublicDetailHeader", () => {
  it("places like count and public metadata beside the author controls", () => {
    const { onLike } = renderHeader(false);

    fireEvent.click(screen.getByRole("button", { name: "点赞，当前 148 个赞" }));

    expect(onLike).toHaveBeenCalledOnce();
    expect(screen.getByText("2026-06-22")).toBeInTheDocument();
    expect(screen.getByText(/内容由/)).toHaveTextContent("内容由 AI 生成");
  });

  it("offers download without exposing withdraw to other viewers", async () => {
    const { onDownload } = renderHeader(false);

    fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "下载" }));

    expect(onDownload).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("menuitem", { name: "下载" })).not.toBeInTheDocument());
    expect(screen.queryByText("撤销发布")).not.toBeInTheDocument();
  });

  it("adds withdraw to the author's own menu", async () => {
    const { onWithdraw } = renderHeader(true);

    fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "撤销发布" }));

    expect(onWithdraw).toHaveBeenCalledOnce();
  });
});
