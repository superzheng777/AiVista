import { notifyManager, type InfiniteData, type QueryClient, type QueryKey } from "@tanstack/react-query";

import type { GenerationAsset, GenerationTurn } from "./generation";

type ImagePage = { items: GenerationAsset[] };
type TurnPage = { items: GenerationTurn[] };
type ImageUpdate = (image: GenerationAsset, key: QueryKey) => GenerationAsset | null;

function mapStable<T>(values: T[], update: (value: T) => T): T[] {
  const next = values.map(update);
  return next.every((value, index) => value === values[index]) ? values : next;
}

function mapImages(images: GenerationAsset[], update: (image: GenerationAsset) => GenerationAsset | null) {
  const next = images.flatMap((image) => {
    const value = update(image);
    return value ? [value] : [];
  });
  return next.length === images.length && next.every((image, index) => image === images[index]) ? images : next;
}

/** Patch existing records only. A single image must never seed a partial list.
 * Preserve freshness and invalidation: a local edit is not a server list snapshot.
 */
export function updateResourceCaches(client: QueryClient, update: ImageUpdate): void {
  notifyManager.batch(() => {
    for (const query of client.getQueryCache().getAll()) {
      const key = query.queryKey;
      const data = query.state.data;
      if (!data) continue;
      const apply = (image: GenerationAsset) => update(image, key);
      let next: unknown = data;
      if (["assets", "publication", "publications", "liked-publications"].includes(String(key[0]))) {
        next = mapImages(data as GenerationAsset[], apply);
      } else if (key[0] === "inspirations") {
        const feed = data as InfiniteData<ImagePage>;
        const pages = mapStable(feed.pages, (page) => {
          const items = mapImages(page.items, apply);
          return items === page.items ? page : { ...page, items };
        });
        if (pages !== feed.pages) next = { ...feed, pages };
      } else if (key[0] === "generation" && key[3] === "turns") {
        const feed = data as InfiniteData<TurnPage>;
        const pages = mapStable(feed.pages, (page) => {
          const items = mapStable(page.items, (turn) => {
            const generations = mapStable(turn.generations, (task) => {
              const images = mapStable(
                task.images,
                (image) =>
                  apply(image) ?? {
                    ...image,
                    imageUrls: { thumbnail: null, display: null },
                  },
              );
              return images === task.images ? task : { ...task, images };
            });
            return generations === turn.generations ? turn : { ...turn, generations };
          });
          return items === page.items ? page : { ...page, items };
        });
        if (pages !== feed.pages) next = { ...feed, pages };
      } else if (key[0] === "public-image-detail" || key[0] === "direct-public-image") {
        // List membership changes should not create a missing-data refetch in an open detail.
        next = apply(data as GenerationAsset) ?? data;
      }
      if (next !== data) query.setState({ data: next });
    }
  });
}

export function patchResource(client: QueryClient, id: string, patch: Partial<GenerationAsset>): void {
  updateResourceCaches(client, (image) => (image.id === id ? { ...image, ...patch } : image));
}

export function removeResources(client: QueryClient, ids: string[], publicationOnly = false): void {
  const removed = new Set(ids);
  updateResourceCaches(client, (image, key) => {
    if (!removed.has(image.id)) return image;
    // Asset deletion and publication withdrawal are independent backend operations.
    // Deleting an owned asset must not hide a still-published work or its likes.
    if (!publicationOnly && key[0] !== "assets" && key[0] !== "generation") return image;
    if (publicationOnly && (key[0] === "assets" || key[0] === "generation")) {
      return { ...image, publicationReviewStatus: "NONE", publicAt: null };
    }
    return null;
  });
}

/** Membership changes happen only after the like API succeeds. */
export function updateMyLikes(client: QueryClient, userId: string, image: GenerationAsset): void {
  for (const query of client.getQueryCache().findAll({ queryKey: ["liked-publications", userId] })) {
    const current = query.state.data as GenerationAsset[] | undefined;
    if (!current) continue;
    const exists = current.some((item) => item.id === image.id);
    const data = !image.likedByCurrentUser
      ? current.filter((item) => item.id !== image.id)
      : exists
        ? current.map((item) =>
            item.id === image.id ? { ...item, likedByCurrentUser: true, likeCount: image.likeCount } : item,
          )
        : [image, ...current];
    query.setState({ data });
  }
}
