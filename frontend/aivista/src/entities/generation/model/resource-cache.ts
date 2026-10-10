import { notifyManager, type InfiniteData, type Query, type QueryClient, type QueryKey } from "@tanstack/react-query";

import type { GenerationAsset } from "./generation";
import { assetQueryKeys, publicResourceQueryKeys, resourceQueryShape } from "./resource-queries";
import type { SessionAsset, SessionDetail } from "./session";

type ImagePage = { items: GenerationAsset[] };
type ImageUpdate = (image: GenerationAsset, key: QueryKey) => GenerationAsset | null;

export function cancelResourceQueries(client: QueryClient, imageIds: readonly string[]): Promise<void> {
  const ids = new Set(imageIds);
  return client.cancelQueries({
    predicate: (query) => {
      const shape = resourceQueryShape(query.queryKey);
      return shape === "detail" ? ids.has(String(query.queryKey[1])) : shape !== undefined;
    },
  });
}

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
function mapResourceData(data: unknown, key: QueryKey, update: ImageUpdate): unknown {
  if (!data) return data;
  const apply = (image: GenerationAsset) => update(image, key);
  switch (resourceQueryShape(key)) {
    case "list":
      return mapImages(data as GenerationAsset[], apply);
    case "pages": {
      const feed = data as InfiniteData<ImagePage>;
      const pages = mapStable(feed.pages, (page) => {
        const items = mapImages(page.items, apply);
        return items === page.items ? page : { ...page, items };
      });
      return pages === feed.pages ? feed : { ...feed, pages };
    }
    // Removing list membership must not trigger a missing-data refetch in open details.
    case "detail":
      return apply(data as GenerationAsset) ?? data;
    default:
      return data;
  }
}

export function updateResourceQuery(query: Query, update: ImageUpdate): void {
  const data = query.state.data;
  const next = mapResourceData(data, query.queryKey, update);
  if (next !== data) query.setState({ data: next });
}

export function updateResourceCaches(client: QueryClient, update: ImageUpdate): void {
  notifyManager.batch(() => {
    for (const query of client.getQueryCache().getAll()) updateResourceQuery(query, update);
  });
}

/** Read only the query that supplied the clicked image. */
export function readResource(client: QueryClient, key: QueryKey, id: string): GenerationAsset | undefined {
  let result: GenerationAsset | undefined;
  mapResourceData(client.getQueryData(key), key, (image) => {
    if (image.id === id) result = image;
    return image;
  });
  return result;
}

export function patchResource(client: QueryClient, id: string, patch: Partial<GenerationAsset>): void {
  updateResourceCaches(client, (image) => (image.id === id ? { ...image, ...patch } : image));
  if (patch.imageUrls?.display) {
    const display = patch.imageUrls.display;
    updateSessionAssets(client, (asset) => (asset.assetId === id ? { ...asset, ...display } : asset));
  }
}

export function removeResources(client: QueryClient, ids: string[], publicationOnly = false): void {
  const removed = new Set(ids);
  if (!publicationOnly)
    updateSessionAssets(client, (asset) =>
      removed.has(asset.assetId) ? { ...asset, url: null, expiresAt: null } : asset,
    );
  updateResourceCaches(client, (image, key) => {
    if (!removed.has(image.id)) return image;
    // Asset deletion and publication withdrawal are independent backend operations.
    // Deleting an owned asset must not hide a still-published work or its likes.
    if (!publicationOnly && key[0] !== assetQueryKeys.all[0]) return image;
    if (publicationOnly && key[0] === assetQueryKeys.all[0]) {
      return { ...image, publicationReviewStatus: "NONE", publicAt: null };
    }
    return null;
  });
}

function updateSessionAssets(client: QueryClient, update: (asset: SessionAsset) => SessionAsset): void {
  for (const query of client.getQueryCache().findAll({ queryKey: ["generation", "session"] })) {
    const current = query.state.data as SessionDetail | undefined;
    if (!current) continue;
    const turns = mapStable(current.turns, (turn) => {
      const assets = mapStable(turn.input.assets, update);
      const items = mapStable(turn.items, (item) => {
        if (item.kind !== "generation") return item;
        const images = mapStable(item.assets, update);
        return images === item.assets ? item : { ...item, assets: images };
      });
      return assets === turn.input.assets && items === turn.items
        ? turn
        : { ...turn, input: { ...turn.input, assets }, items };
    });
    if (turns !== current.turns) query.setState({ data: { ...current, turns } });
  }
}

/** Membership changes happen only after the like API succeeds. */
export function updateMyLikes(client: QueryClient, userId: string, image: GenerationAsset): void {
  for (const query of client.getQueryCache().findAll({ queryKey: publicResourceQueryKeys.likes(userId) })) {
    const current = query.state.data as GenerationAsset[] | undefined;
    if (!current) continue;
    if (current.some((item) => item.id === image.id && item.publicationVersion !== image.publicationVersion)) continue;
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
