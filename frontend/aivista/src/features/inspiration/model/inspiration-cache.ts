import type { InfiniteData, QueryClient } from "@tanstack/react-query";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import { inspirationQueryKeys, type InspirationPage } from "@/features/inspiration/api/inspiration-api";

export function updateInspirationInFeeds(queryClient: QueryClient, image: GenerationAsset): void {
  queryClient.setQueriesData<InfiniteData<InspirationPage>>(
    { queryKey: inspirationQueryKeys.all },
    (current) => current && {
      ...current,
      pages: current.pages.map((page) => ({
        ...page,
        items: page.items.map((item) => item.id === image.id ? image : item),
      })),
    },
  );
}
