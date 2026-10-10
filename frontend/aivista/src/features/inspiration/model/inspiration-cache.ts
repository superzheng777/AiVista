import { getApiErrorCode } from "@/shared/api/api-response";

import type { QueryClient } from "@tanstack/react-query";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import { assetQueryKeys, publicationQueryKeys } from "@/entities/generation/model/resource-queries";
import { updateResourceCaches } from "@/entities/generation/model/resource-cache";

export function updateInspirationInFeeds(queryClient: QueryClient, image: GenerationAsset): void {
  updateResourceCaches(queryClient, (current, key) => {
    if (current.id !== image.id) return current;
    // Public responses must not replace private URLs or private favorite state.
    if (key[0] === assetQueryKeys.all[0]) return current;
    return { ...current, ...image, favorited: current.favorited };
  });
}

/** A missing public publication does not imply that its private asset was deleted. */
export function discardUnavailableInspiration(client: QueryClient, id: string, error: unknown): void {
  if (getApiErrorCode(error) !== 40401) return;
  updateResourceCaches(client, (image, key) =>
    image.id === id && key[0] !== assetQueryKeys.all[0] && key[0] !== publicationQueryKeys.mine[0] ? null : image,
  );
}
