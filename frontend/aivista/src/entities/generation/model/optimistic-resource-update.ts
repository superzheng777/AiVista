import { hashKey, type Query, type QueryClient } from "@tanstack/react-query";
import type { GenerationAsset } from "./generation";
import { cancelResourceQueries, updateResourceCaches, updateResourceQuery } from "./resource-cache";

type Patch = Partial<Pick<GenerationAsset, "favorited" | "likedByCurrentUser" | "likeCount">>;
const activeUpdates = new WeakMap<QueryClient, Set<() => void>>();

/** Authentication changes must release pending overlays before clearing/resetting caches. */
export function discardOptimisticResourceUpdates(client: QueryClient): void {
  activeUpdates.get(client)?.forEach((dispose) => dispose());
}

/** Install after awaiting cancelResourceQueries. Keep pending fields across later refetches.
 * Snapshot only the edited fields per cache, so rollback preserves URLs and unrelated edits.
 */
export function optimisticResourceUpdate(
  client: QueryClient,
  patches: ReadonlyMap<string, Patch>,
  publicationVersions?: ReadonlyMap<string, number>,
) {
  const previous = new Map<string, Map<string, Patch>>();
  let active = true;
  let applying = false;
  const matchesVersion = (image: GenerationAsset) =>
    !publicationVersions?.has(image.id) || publicationVersions.get(image.id) === image.publicationVersion;
  const apply = (query?: Query) => {
    if (applying || !active) return;
    applying = true;
    try {
      const update: Parameters<typeof updateResourceCaches>[1] = (image, key) => {
        const patch = patches.get(image.id);
        if (!patch || !matchesVersion(image)) return image;
        const hash = hashKey(key);
        const snapshots = previous.get(hash) ?? new Map<string, Patch>();
        previous.set(hash, snapshots);
        if (!snapshots.has(image.id)) {
          snapshots.set(
            image.id,
            Object.fromEntries(Object.keys(patch).map((field) => [field, image[field as keyof Patch]])) as Patch,
          );
        }
        return Object.entries(patch).every(([field, value]) => image[field as keyof Patch] === value)
          ? image
          : { ...image, ...patch };
      };
      if (query) updateResourceQuery(query, update);
      else updateResourceCaches(client, update);
    } finally {
      applying = false;
    }
  };
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event.type === "updated") apply(event.query);
  });
  const updates = activeUpdates.get(client) ?? new Set<() => void>();
  activeUpdates.set(client, updates);
  const dispose = () => {
    active = false;
    unsubscribe();
    updates.delete(dispose);
  };
  updates.add(dispose);
  apply();
  return {
    async finish(commit: boolean) {
      if (!active) return false;
      try {
        // Also cancel requests started while the mutation was pending before releasing protection.
        await cancelResourceQueries(client, [...patches.keys()]);
        if (!active) return false;
        if (commit) apply();
      } finally {
        dispose();
      }
      if (!commit)
        updateResourceCaches(client, (image, key) => {
          const snapshot = previous.get(hashKey(key))?.get(image.id);
          return snapshot && matchesVersion(image) ? { ...image, ...snapshot } : image;
        });
      previous.clear();
      return true;
    },
  };
}
