import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuthorCard } from "@/features/inspiration/ui/public-image-detail";
import type { PublicAuthor } from "@/features/public-user/api/public-user-api";

vi.mock("@/features/auth/model/auth-dialog-provider", () => ({ useAuthDialog: () => ({ open: vi.fn() }) }));
vi.mock("@/features/auth/model/session-provider", () => ({ useSession: () => ({ status: "anonymous", user: null }) }));

const author: PublicAuthor = { id: "12" as PublicAuthor["id"], nickname: "林风", avatarUrl: "https://cdn.example/avatar.png", bio: null, followerCount: 3, followingCount: 2, receivedLikeCount: 8, likesPublic: false, viewerFollowing: false, viewerFollowedByAuthor: false };
const renderCard = (value: PublicAuthor) => render(<AuthorCard author={value} loading={false} isSelf={false} following={false} onFollow={vi.fn()} />);

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
});
