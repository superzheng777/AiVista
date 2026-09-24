import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import { AuthorCard, PublicDetailHeader } from "@/features/inspiration/ui/public-image-detail";
import type { PublicAuthor } from "@/features/public-user/api/public-user-api";

vi.mock("@/features/auth/model/auth-dialog-provider", () => ({ useAuthDialog: () => ({ open: vi.fn() }) }));
vi.mock("@/features/auth/model/session-provider", () => ({ useSession: () => ({ status: "anonymous", user: null }) }));

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
const renderCard = (value: PublicAuthor) =>
  render(<AuthorCard author={value} loading={false} isSelf={false} following={false} onFollow={vi.fn()} />);

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
      likeError={false}
      downloadError={false}
      withdrawError={false}
      {...callbacks}
    />,
  );
  return callbacks;
}

describe("AuthorCard", () => {
  it("renders the supplied avatar URL", () => {
    renderCard(author);
    expect(screen.getByRole("img", { name: "林风的头像" })).toHaveAttribute("src", author.avatarUrl);
  });

  it("falls back to the nickname initial only when avatarUrl is absent", () => {
    renderCard({ ...author, avatarUrl: null });
    expect(screen.queryByRole("img", { name: "林风的头像" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("林风的主页")).toHaveTextContent("林");
  });

  it.each([
    [false, false, "关注"],
    [false, true, "回关"],
    [true, false, "已关注"],
    [true, true, "互相关注"],
  ])("derives follow state %s/%s as %s", (viewerFollowing, viewerFollowedByAuthor, label) => {
    renderCard({ ...author, viewerFollowing, viewerFollowedByAuthor });
    expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
  });

  it("does not repeat follower and received-like totals beneath the author", () => {
    renderCard(author);
    expect(screen.queryByText(/位关注者/)).not.toBeInTheDocument();
    expect(screen.queryByText(/获赞/)).not.toBeInTheDocument();
  });

  it("does not render a follow button for the author viewing their own work", () => {
    render(<AuthorCard author={author} loading={false} isSelf following={false} onFollow={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "关注" })).not.toBeInTheDocument();
  });
});

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
