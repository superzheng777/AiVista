import type { GenerationAsset } from "@/entities/image-resource/model/image-resource";
import { useUserEventStreamStore } from "@/entities/user-event-stream/model/user-event-stream-store";
import { assetQueryKeys, deleteGenerationAssets, listGenerationAssets } from "@/features/assets/api/asset-api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetLibraryWorkspace } from "./asset-library-workspace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/assets/api/asset-api", async (original) => ({
  ...(await original<typeof import("@/features/assets/api/asset-api")>()),
  listGenerationAssets: vi.fn(),
  deleteGenerationAssets: vi.fn(),
}));
const asset: GenerationAsset = {
  id: "image-1",
  sourceIndex: 0,
  imageUrls: { thumbnail: null, display: { url: "https://example.test/image.png", expiresAt: null } },
  width: 1024,
  height: 1024,
  createdAt: "2026-10-13T00:00:00Z",
  favorited: false,
  finalPrompt: "test",
  finalNegativePrompt: null,
  requestedImageCount: 1,
  promptExtend: true,
  publicationReviewStatus: "NONE",
  publicationVersion: 0,
  publicAt: null,
  title: "作品",
  description: null,
  authorId: "self",
  likeCount: 0,
  likedByCurrentUser: false,
};
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  useUserEventStreamStore.setState(useUserEventStreamStore.getInitialState(), true);
  vi.mocked(listGenerationAssets).mockResolvedValue([asset]);
});
afterEach(() => {
  cleanup();
  client.clear();
});
async function selectAsset() {
  render(
    <QueryClientProvider client={client}>
      <AssetLibraryWorkspace />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "选择图片" }));
  expect(screen.getByText("已选择 1 项")).toBeInTheDocument();
}
describe("AssetLibraryWorkspace mutations", () => {
  it("restores the cached item and selection when optimistic deletion fails", async () => {
    let reject!: (error: Error) => void;
    vi.mocked(deleteGenerationAssets).mockImplementation(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    await selectAsset();
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "删除" }));
    await waitFor(() => expect(client.getQueryData(assetQueryKeys.all)).toEqual([]));
    await act(async () => reject(new Error("failed")));
    await screen.findByText("删除失败，请重试。");
    expect(client.getQueryData(assetQueryKeys.all)).toEqual([asset]);
    expect(screen.getByText("已选择 1 项")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteGenerationAssets).toHaveBeenCalledWith(["image-1"], expect.anything());
  });
  it("clears selection when leaving bulk management", async () => {
    await selectAsset();
    fireEvent.click(screen.getByRole("button", { name: "取消选择" }));
    expect(screen.queryByText("已选择 1 项")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "批量操作" }));
    expect(screen.getByText("已选择 0 项")).toBeInTheDocument();
  });
});
