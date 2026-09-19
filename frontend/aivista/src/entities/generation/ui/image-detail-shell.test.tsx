import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import { ImageDetailShell } from "./image-detail-shell";

vi.mock("@/features/auth/model/auth-dialog-provider", () => ({ useAuthDialog: () => ({ open: vi.fn() }) }));
vi.mock("@/features/auth/model/session-provider", () => ({ useSession: () => ({ status: "anonymous", user: null }) }));

const image = {
  id: "1",
  sourceIndex: 0,
  imageUrls: { thumbnail: null, display: null },
  width: 1024,
  height: 1024,
  createdAt: "2026-01-01T00:00:00Z",
  favorited: false,
  finalPrompt: "prompt",
  finalNegativePrompt: null,
  requestedImageCount: 1,
  promptExtend: true,
  publicationReviewStatus: "NONE",
  publicationVersion: 0,
  publicAt: null,
  title: "作品",
  description: null,
  authorId: "7",
  likeCount: 0,
  likedByCurrentUser: false,
} satisfies GenerationAsset;

describe("ImageDetailShell navigation", () => {
  it("renders icon-only previous and next controls with accessible names", () => {
    render(<ImageDetailShell image={image} onClose={vi.fn()} navigation={{
      hasPrevious: true,
      hasNext: false,
      pending: false,
      previous: vi.fn(),
      next: vi.fn(),
    }} />);

    expect(screen.getByRole("button", { name: "上一张作品" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "下一张作品" })).toBeDisabled();
    expect(screen.queryByText("上一张作品")).not.toBeInTheDocument();
    expect(screen.queryByText("下一张作品")).not.toBeInTheDocument();
  });
});
