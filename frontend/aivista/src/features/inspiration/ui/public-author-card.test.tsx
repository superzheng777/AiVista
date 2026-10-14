import type { PublicAuthor } from "@/features/public-user/api/public-user-api";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthorCard } from "./public-author-card";

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

const renderCard = (value: PublicAuthor) =>
  render(<AuthorCard author={value} loading={false} isSelf={false} following={false} onFollow={vi.fn()} />);

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
