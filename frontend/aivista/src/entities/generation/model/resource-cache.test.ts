import { QueryClient, QueryObserver, type InfiniteData } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { publicResourceListPolicy } from "@/shared/api/resource-list-policy";
import type { GenerationAsset } from "./generation";
import { patchResource, removeResources, updateMyLikes } from "./resource-cache";

const image: GenerationAsset = {
  id: "image-1",
  sourceIndex: 0,
  width: 1024,
  height: 1024,
  imageUrls: { thumbnail: { url: "https://example.com/old-signed-url", expiresAt: null }, display: null },
  createdAt: "2026-10-05T00:00:00Z",
  favorited: false,
  finalPrompt: "test",
  finalNegativePrompt: null,
  requestedImageCount: 1,
  promptExtend: false,
  publicationReviewStatus: "APPROVED",
  publicationVersion: 1,
  publicAt: "2026-10-05T00:00:00Z",
  title: "test",
  description: null,
  authorId: "user-1",
  likeCount: 0,
  likedByCurrentUser: false,
};

const clients: QueryClient[] = [];
function client() {
  const value = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(value);
  return value;
}
afterEach(() => {
  clients.splice(0).forEach((value) => value.clear());
  vi.useRealTimers();
});

describe("resource list caching", () => {
  it("renews public cache retention without refreshing, then fetches after eviction", async () => {
    vi.useFakeTimers();
    const cache = client();
    const queryFn = vi.fn(async () => [image]);
    const options = { ...publicResourceListPolicy, queryKey: ["publications", "author"], queryFn };
    await cache.fetchQuery(options);
    let observer = new QueryObserver(cache, options);
    let unsubscribe = observer.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(20 * 60 * 1000);
    unsubscribe();
    await vi.advanceTimersByTimeAsync(9 * 60 * 1000);
    observer = new QueryObserver(cache, options);
    unsubscribe = observer.subscribe(() => {});
    expect(queryFn).toHaveBeenCalledTimes(1);
    unsubscribe();
    await vi.advanceTimersByTimeAsync(9 * 60 * 1000);
    expect(cache.getQueryData(options.queryKey)).toEqual([image]);
    await vi.advanceTimersByTimeAsync(61 * 1000);
    expect(cache.getQueryData(options.queryKey)).toBeUndefined();
    observer = new QueryObserver(cache, options);
    unsubscribe = observer.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("local edits preserve list age, pending invalidation and image URLs", async () => {
    const cache = client();
    cache.setQueryData(["assets"], [image], { updatedAt: 1234 });
    await cache.invalidateQueries({ queryKey: ["assets"], refetchType: "none" });
    patchResource(cache, image.id, { favorited: true });
    const state = cache.getQueryState<GenerationAsset[]>(["assets"])!;
    expect(state.dataUpdatedAt).toBe(1234);
    expect(state.isInvalidated).toBe(true);
    expect(state.data![0]).toMatchObject({ favorited: true, imageUrls: image.imageUrls });
    expect(cache.getQueryData(["publication", "mine"])).toBeUndefined();
  });

  it("syncs like fields across feeds and profiles, changing only the current user's membership", () => {
    const cache = client();
    cache.setQueryData(["inspirations", "search", "test"], {
      pages: [{ items: [image], nextOffset: 20 }],
      pageParams: [null],
    });
    cache.setQueryData(["publications", "author"], [image]);
    cache.setQueryData(["liked-publications", "viewer", "self"], []);
    cache.setQueryData(["liked-publications", "someone-else", "public"], [image]);
    const liked = { ...image, likedByCurrentUser: true, likeCount: 1 };
    patchResource(cache, image.id, { likedByCurrentUser: true, likeCount: 1 });
    updateMyLikes(cache, "viewer", liked);
    expect(cache.getQueryData(["liked-publications", "viewer", "self"])).toEqual([liked]);
    const feed = cache.getQueryData<InfiniteData<{ items: GenerationAsset[]; nextOffset: number }>>([
      "inspirations",
      "search",
      "test",
    ])!;
    expect(feed.pages[0]).toEqual({ items: [liked], nextOffset: 20 });
    updateMyLikes(cache, "viewer", image);
    expect(cache.getQueryData(["liked-publications", "viewer", "self"])).toEqual([]);
    expect(cache.getQueryData(["liked-publications", "someone-else", "public"])).toEqual([liked]);
    updateMyLikes(cache, "uncached-viewer", liked);
    expect(cache.getQueryData(["liked-publications", "uncached-viewer", "self"])).toBeUndefined();
  });

  it("deletes a private asset without withdrawing the published work or its likes", () => {
    const cache = client();
    cache.setQueryData(["assets"], [image]);
    cache.setQueryData(["publication", "mine"], [image]);
    cache.setQueryData(["publications", image.authorId], [image]);
    cache.setQueryData(["liked-publications", "viewer", "self"], [image]);
    cache.setQueryData(["inspirations", "discovery"], {
      pages: [{ items: [image], nextCursor: null }],
      pageParams: [null],
    });
    removeResources(cache, [image.id]);
    expect(cache.getQueryData(["assets"])).toEqual([]);
    expect(cache.getQueryData(["publication", "mine"])).toEqual([image]);
    expect(cache.getQueryData(["publications", image.authorId])).toEqual([image]);
    expect(cache.getQueryData(["liked-publications", "viewer", "self"])).toEqual([image]);
    expect(cache.getQueryData(["inspirations", "discovery"])).toEqual({
      pages: [{ items: [image], nextCursor: null }],
      pageParams: [null],
    });
  });

  it("withdraws a publication without deleting its private asset", () => {
    const cache = client();
    cache.setQueryData(["assets"], [image]);
    cache.setQueryData(["publication", "mine"], [image]);
    cache.setQueryData(["publications", image.authorId], [image]);
    cache.setQueryData(["inspirations", "discovery"], {
      pages: [{ items: [image], nextCursor: "next" }],
      pageParams: [null],
    });
    removeResources(cache, [image.id], true);
    expect(cache.getQueryData<GenerationAsset[]>(["assets"])![0]).toMatchObject({
      id: image.id,
      publicationReviewStatus: "NONE",
      imageUrls: image.imageUrls,
    });
    expect(cache.getQueryData(["publication", "mine"])).toEqual([]);
    expect(cache.getQueryData(["publications", image.authorId])).toEqual([]);
    expect(cache.getQueryData(["inspirations", "discovery"])).toEqual({
      pages: [{ items: [], nextCursor: "next" }],
      pageParams: [null],
    });
    removeResources(cache, [image.id]);
    expect(cache.getQueryData(["assets"])).toEqual([]);
  });
});
