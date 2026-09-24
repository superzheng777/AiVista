import { QueryClient, QueryClientProvider, useQuery, type InfiniteData } from "@tanstack/react-query";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const auth = vi.hoisted(() => ({
  status: "authenticated" as "authenticated" | "anonymous",
  open: vi.fn(),
}));

vi.mock("@/features/auth/model/auth-dialog-provider", () => ({ useAuthDialog: () => ({ open: auth.open }) }));
vi.mock("@/features/auth/model/session-provider", () => ({ useSession: () => ({ status: auth.status, user: null }) }));
vi.mock("@/shared/api/browser-client", () => ({ browserApiClient: { get: vi.fn(), put: vi.fn(), delete: vi.fn() } }));

import type { GenerationAsset } from "@/entities/generation/model/generation";
import { inspirationQueryKeys, type InspirationPage } from "@/features/inspiration/api/inspiration-api";
import { PublicInspirationCard } from "@/features/inspiration/ui/public-inspiration-card";
import { browserApiClient } from "@/shared/api/browser-client";

const apiClient = vi.mocked(browserApiClient);
const image: GenerationAsset = {
  id: "image-11",
  sourceIndex: 0,
  imageUrls: {
    thumbnail: { url: "https://cdn.example/image-11.jpg", expiresAt: "2099-01-01T00:00:00Z" },
    display: { url: "https://cdn.example/image-11-display.jpg", expiresAt: "2099-01-01T00:00:00Z" },
  },
  width: 1024,
  height: 1024,
  createdAt: "2026-09-23T00:00:00Z",
  favorited: false,
  finalPrompt: "prompt",
  finalNegativePrompt: null,
  requestedImageCount: 1,
  promptExtend: false,
  publicationReviewStatus: "APPROVED",
  publicationVersion: 3,
  publicAt: "2026-09-23T00:00:00Z",
  title: "森林黏土茶会",
  description: null,
  authorId: "author-7",
  likeCount: 2,
  likedByCurrentUser: false,
};

beforeAll(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

beforeEach(() => {
  vi.clearAllMocks();
  auth.status = "authenticated";
});

function CacheBackedCard({ onOpen }: { onOpen: (value: GenerationAsset) => void }) {
  const { data } = useQuery<InfiniteData<InspirationPage>>({
    queryKey: inspirationQueryKeys.discovery,
    queryFn: async () => {
      throw new Error("The seeded feed should not refetch in this test.");
    },
    staleTime: Infinity,
  });
  return <PublicInspirationCard image={data!.pages[0]!.items[0]!} onOpen={onOpen} />;
}

function renderCard(initialImage: GenerationAsset = image) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  queryClient.setQueryData<InfiniteData<InspirationPage>>(inspirationQueryKeys.discovery, {
    pages: [{ items: [initialImage], nextCursor: null }],
    pageParams: [null],
  });
  const onOpen = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <CacheBackedCard onOpen={onOpen} />
    </QueryClientProvider>,
  );
  return { queryClient, onOpen };
}

function cachedImage(queryClient: QueryClient): GenerationAsset {
  return queryClient.getQueryData<InfiniteData<InspirationPage>>(inspirationQueryKeys.discovery)!.pages[0]!.items[0]!;
}

describe("PublicInspirationCard likes", () => {
  it("opens authentication without changing state or opening details for anonymous users", () => {
    auth.status = "anonymous";
    const { queryClient, onOpen } = renderCard();

    fireEvent.click(screen.getByRole("button", { name: "点赞，当前 2 个赞" }));

    expect(auth.open).toHaveBeenCalledOnce();
    expect(apiClient.put).not.toHaveBeenCalled();
    expect(apiClient.delete).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
    expect(cachedImage(queryClient)).toMatchObject({ likedByCurrentUser: false, likeCount: 2 });
  });

  it("optimistically likes the image without opening details", async () => {
    apiClient.put.mockResolvedValueOnce({} as never);
    const { queryClient, onOpen } = renderCard();

    fireEvent.click(screen.getByRole("button", { name: "点赞，当前 2 个赞" }));

    await waitFor(() =>
      expect(apiClient.put).toHaveBeenCalledWith("/inspirations/image-11/like", undefined, {
        params: { publicationVersion: 3 },
      }),
    );
    expect(onOpen).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "取消点赞，当前 3 个赞" })).toHaveAttribute("aria-pressed", "true"),
    );
    expect(cachedImage(queryClient)).toMatchObject({ likedByCurrentUser: true, likeCount: 3 });
  });

  it("optimistically removes an existing like", async () => {
    apiClient.delete.mockResolvedValueOnce({} as never);
    const { queryClient } = renderCard({ ...image, likedByCurrentUser: true });

    fireEvent.click(screen.getByRole("button", { name: "取消点赞，当前 2 个赞" }));

    await waitFor(() =>
      expect(apiClient.delete).toHaveBeenCalledWith("/inspirations/image-11/like", {
        params: { publicationVersion: 3 },
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "点赞，当前 1 个赞" })).toHaveAttribute("aria-pressed", "false"),
    );
    expect(cachedImage(queryClient)).toMatchObject({ likedByCurrentUser: false, likeCount: 1 });
  });

  it("disables duplicate clicks while pending and rolls back a failed request", async () => {
    let rejectRequest!: (reason?: unknown) => void;
    apiClient.put.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectRequest = reject;
      }) as never,
    );
    const { queryClient } = renderCard();

    fireEvent.click(screen.getByRole("button", { name: "点赞，当前 2 个赞" }));

    const pendingButton = await screen.findByRole("button", { name: "取消点赞，当前 3 个赞" });
    expect(pendingButton).toBeDisabled();
    fireEvent.click(pendingButton);
    expect(apiClient.put).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectRequest(new Error("request failed"));
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "点赞，当前 2 个赞" })).toHaveAttribute("aria-pressed", "false"),
    );
    expect(screen.getByRole("status")).toHaveTextContent("点赞状态更新失败，已恢复原状态。");
    expect(cachedImage(queryClient)).toMatchObject({ likedByCurrentUser: false, likeCount: 2 });
  });
});
