import { QueryClient, QueryObserver, type InfiniteData } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { publicResourceListPolicy } from "@/shared/api/resource-list-policy";
import type { GenerationAsset } from "./generation";
import { discardOptimisticResourceUpdates, optimisticResourceUpdate } from "./optimistic-resource-update";
import { cancelResourceQueries, readResource, patchResource, removeResources, updateMyLikes } from "./resource-cache";

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

describe("optimistic resource races", () => {
  it("cancels old list/detail responses across resource families without cancelling unrelated queries", async () => {
    const cache = client();
    const shapes = [
      { key: ["assets"], data: [image] },
      { key: ["publication", "mine"], data: [image] },
      { key: ["publications", "author"], data: [image] },
      { key: ["liked-publications", "viewer"], data: [image] },
      { key: ["inspirations", "discovery"], data: { pages: [{ items: [image] }], pageParams: [null] } },
      { key: ["public-image-detail", image.id], data: image },
      { key: ["direct-public-image", image.id], data: image },
    ];
    const resolvers: Array<() => void> = [];
    const requests = shapes.map(({ key, data }) => {
      cache.setQueryData(key, data);
      return cache
        .fetchQuery({
          queryKey: key,
          queryFn: () =>
            new Promise((resolve) => {
              resolvers.push(() => resolve(data));
            }),
        })
        .catch(() => undefined);
    });
    let resolveProfile!: (value: string) => void;
    const profile = cache.fetchQuery({
      queryKey: ["public-author", "author"],
      queryFn: () =>
        new Promise<string>((resolve) => {
          resolveProfile = resolve;
        }),
    });
    await cancelResourceQueries(cache, [image.id]);
    const update = optimisticResourceUpdate(cache, new Map([[image.id, { favorited: true }]]));
    resolvers.forEach((resolve) => resolve());
    await Promise.all(requests);
    for (const { key } of shapes) {
      expect(JSON.stringify(cache.getQueryData(key))).toContain('"favorited":true');
      expect(cache.getQueryState(key)?.fetchStatus).toBe("idle");
    }
    expect(cache.getQueryState(["public-author", "author"])?.fetchStatus).toBe("fetching");
    resolveProfile("author");
    await profile;
    await update.finish(true);
  });

  it("protects pending fields from new refreshes, rolls back only those fields and releases protection", async () => {
    const cache = client();
    cache.setQueryData(["assets"], [image]);
    await cancelResourceQueries(cache, [image.id]);
    const favorite = optimisticResourceUpdate(cache, new Map([[image.id, { favorited: true }]]));
    const like = optimisticResourceUpdate(cache, new Map([[image.id, { likedByCurrentUser: true, likeCount: 1 }]]));
    const refreshed = {
      ...image,
      title: "new title",
      imageUrls: { ...image.imageUrls, display: { url: "new-url", expiresAt: null } },
    };
    await cache.fetchQuery({ queryKey: ["assets"], queryFn: async () => [refreshed] });
    expect(cache.getQueryData<GenerationAsset[]>(["assets"])![0]).toMatchObject({
      favorited: true,
      likedByCurrentUser: true,
      likeCount: 1,
      title: "new title",
    });
    await favorite.finish(false);
    expect(cache.getQueryData<GenerationAsset[]>(["assets"])![0]).toMatchObject({
      favorited: false,
      likedByCurrentUser: true,
      likeCount: 1,
      title: "new title",
      imageUrls: refreshed.imageUrls,
    });
    await like.finish(true);
    cache.setQueryData(["assets"], [refreshed]);
    expect(cache.getQueryData(["assets"])).toEqual([refreshed]);
  });

  it("snapshots each cache separately and reads only the explicit source regardless of cache timestamps", async () => {
    const cache = client();
    cache.setQueryData(["assets"], [image], { updatedAt: 1 });
    cache.setQueryData(["direct-public-image", image.id], { ...image, likeCount: 10 }, { updatedAt: 2 });
    await cancelResourceQueries(cache, [image.id]);
    expect(readResource(cache, ["direct-public-image", image.id], image.id)?.likeCount).toBe(10);
    expect(readResource(cache, ["assets"], image.id)?.likeCount).toBe(0);
    const update = optimisticResourceUpdate(cache, new Map([[image.id, { likedByCurrentUser: true, likeCount: 11 }]]));
    patchResource(cache, image.id, { title: "edited while pending" });
    await update.finish(false);
    expect(cache.getQueryData<GenerationAsset[]>(["assets"])![0]).toMatchObject({
      likeCount: 0,
      title: "edited while pending",
    });
    expect(cache.getQueryData(["direct-public-image", image.id])).toMatchObject({
      likeCount: 10,
      title: "edited while pending",
    });
  });
});

it("cancels refreshes started during submission before committing and ignores their late response", async () => {
  const cache = client();
  cache.setQueryData(["assets"], [image]);
  const update = optimisticResourceUpdate(cache, new Map([[image.id, { favorited: true }]]));
  let resolve!: (value: GenerationAsset[]) => void;
  const refresh = cache
    .fetchQuery({
      queryKey: ["assets"],
      queryFn: () =>
        new Promise<GenerationAsset[]>((done) => {
          resolve = done;
        }),
    })
    .catch(() => undefined);
  await update.finish(true);
  resolve([image]);
  await refresh;
  expect(cache.getQueryData<GenerationAsset[]>(["assets"])![0]!.favorited).toBe(true);
});

it("does not apply a previous user's pending update after an identity reset", async () => {
  const cache = client();
  cache.setQueryData(["assets"], [image]);
  const update = optimisticResourceUpdate(cache, new Map([[image.id, { favorited: true }]]));
  discardOptimisticResourceUpdates(cache);
  cache.clear();
  cache.setQueryData(["assets"], [image]);
  expect(await update.finish(true)).toBe(false);
  expect(cache.getQueryData(["assets"])).toEqual([image]);
});

it("does not cancel another image detail or miss a list that has not returned the target yet", async () => {
  const cache = client();
  const detailKey = ["public-image-detail", "other-image"];
  const listKey = ["publications", "empty-author"];
  cache.setQueryData(listKey, []);
  let resolveDetail!: (value: GenerationAsset) => void;
  let resolveList!: (value: GenerationAsset[]) => void;
  const detail = cache.fetchQuery({
    queryKey: detailKey,
    queryFn: () =>
      new Promise<GenerationAsset>((resolve) => {
        resolveDetail = resolve;
      }),
  });
  const list = cache
    .fetchQuery({
      queryKey: listKey,
      queryFn: () =>
        new Promise<GenerationAsset[]>((resolve) => {
          resolveList = resolve;
        }),
    })
    .catch(() => undefined);
  await cancelResourceQueries(cache, [image.id]);
  expect(cache.getQueryState(detailKey)?.fetchStatus).toBe("fetching");
  expect(cache.getQueryState(listKey)?.fetchStatus).toBe("idle");
  resolveDetail({ ...image, id: "other-image" });
  resolveList([image]);
  await Promise.all([detail, list]);
  expect(cache.getQueryData(listKey)).toEqual([]);
});

it.each([true, false])("does not patch or roll back a different publication version (commit=%s)", async (commit) => {
  const cache = client();
  const key = ["public-image-detail", image.id];
  const newer = { ...image, publicationVersion: 2, likeCount: 20 };
  cache.setQueryData(key, image);
  cache.setQueryData(["publications", "author"], [newer]);
  const update = optimisticResourceUpdate(
    cache,
    new Map([[image.id, { likedByCurrentUser: true, likeCount: 1 }]]),
    new Map([[image.id, 1]]),
  );
  expect(cache.getQueryData(["publications", "author"])).toEqual([newer]);
  cache.setQueryData(key, newer);
  await update.finish(commit);
  expect(cache.getQueryData(key)).toEqual(newer);
  cache.setQueryData(["liked-publications", "viewer", "self"], [newer]);
  updateMyLikes(cache, "viewer", image);
  expect(cache.getQueryData(["liked-publications", "viewer", "self"])).toEqual([newer]);
});
