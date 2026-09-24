import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GenerationAsset } from "@/entities/generation/model/generation";

const assetApi = vi.hoisted(() => ({
  listGenerationAssets: vi.fn(),
  setGenerationImageFavorites: vi.fn(),
}));

vi.mock("@/features/assets/api/asset-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/assets/api/asset-api")>();
  return {
    ...actual,
    listGenerationAssets: assetApi.listGenerationAssets,
    setGenerationImageFavorites: assetApi.setGenerationImageFavorites,
  };
});
vi.mock("@/features/generation/model/generation-event-stream-provider", () => ({
  useGenerationEventStream: () => ({
    hasCompletedResults: false,
    acknowledgeCompletedResults: vi.fn(),
  }),
}));
vi.mock("@/features/publication/ui/publication-form-dialog", () => ({
  PublicationFormDialog: () => null,
}));
vi.mock("@/entities/generation/ui/image-detail-shell", () => ({
  ImageDetailShell: ({ image, actions }: { image: GenerationAsset; actions?: ReactNode }) => (
    <div>
      <span>{image.favorited ? "详情已收藏" : "详情未收藏"}</span>
      {actions}
    </div>
  ),
}));

import { AssetsWorkspace } from "./assets-workspace";

const asset: GenerationAsset = {
  id: "asset-1",
  sourceIndex: 0,
  imageUrls: {
    thumbnail: { url: "https://cdn.example/asset-1-thumbnail.webp", expiresAt: "2099-01-01T00:00:00Z" },
    display: { url: "https://cdn.example/asset-1.webp", expiresAt: "2099-01-01T00:00:00Z" },
  },
  width: 1024,
  height: 1024,
  createdAt: "2026-09-24T00:00:00Z",
  favorited: false,
  finalPrompt: "测试提示词",
  finalNegativePrompt: null,
  requestedImageCount: 1,
  promptExtend: false,
  publicationReviewStatus: "NONE",
  publicationVersion: 0,
  publicAt: null,
  title: "测试作品",
  description: null,
  authorId: "user-1",
  likeCount: 0,
  likedByCurrentUser: false,
};

describe("AssetsWorkspace detail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assetApi.listGenerationAssets.mockResolvedValue([asset]);
    assetApi.setGenerationImageFavorites.mockImplementation(() => new Promise(() => undefined));
  });

  it("renders detail favorite state from the optimistically updated asset cache", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <AssetsWorkspace />
      </QueryClientProvider>,
    );

    const thumbnail = await screen.findByAltText("测试作品");
    fireEvent.click(thumbnail.closest("button")!);
    expect(screen.getByText("详情未收藏")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "收藏" }));

    await waitFor(() => expect(screen.getByText("详情已收藏")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "已收藏" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps asset metadata off the grid and overlays publication status on the image", async () => {
    assetApi.listGenerationAssets.mockResolvedValue([{ ...asset, publicationReviewStatus: "APPROVED" }]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <AssetsWorkspace />
      </QueryClientProvider>,
    );

    const thumbnail = await screen.findByAltText("测试作品");
    expect(screen.queryByText("管理、发布和继续编辑你的生成作品")).not.toBeInTheDocument();
    expect(screen.queryByText("测试作品")).not.toBeInTheDocument();
    expect(screen.queryByText("2026/09/24")).not.toBeInTheDocument();
    const badge = screen.getByText("已发布");
    expect(thumbnail.closest("button")?.parentElement).toContainElement(badge);
    expect(badge).toHaveClass("absolute", "right-3", "top-3", "group-focus-within:opacity-0");
  });
});
