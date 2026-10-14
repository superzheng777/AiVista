"use client";

import { useImageDetailNavigation } from "@/entities/image-resource/model/use-image-detail-navigation";
import { inspirationQueryKeys, searchInspirations } from "@/features/inspiration/api/inspiration-api";
import { updateInspirationInFeeds } from "@/features/inspiration/model/inspiration-cache";
import { searchFormSchema, searchQueryKey } from "@/features/inspiration/model/search-query";
import { usePublicImageDetail } from "@/features/inspiration/model/use-public-image-detail";
import { InspirationSearchForm } from "@/features/inspiration/ui/inspiration-search-form";
import { PublicImageDetailOverlay } from "@/features/inspiration/ui/public-image-detail-overlay";
import { PublicImageOpenError } from "@/features/inspiration/ui/public-image-open-error";
import { PublicInspirationCard } from "@/features/inspiration/ui/public-inspiration-card";
import { publicResourceListPolicy } from "@/shared/api/resource-list-policy";
import { ShortestLaneFeed } from "@/shared/ui/shortest-lane-feed/shortest-lane-feed";
import { getWorkPreviewCardHeight } from "@/shared/ui/work-preview-card/work-preview-card";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { deduplicate } from "../lib/search-results";
import { ErrorState, LoadMoreError, Skeleton, State } from "./inspiration-search-states";

const scrollPositions = new Map<string, number>();

export function InspirationSearchResults({ keyword }: { keyword: string }) {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const queryKey = searchQueryKey(keyword);
  const validationResult = searchFormSchema.safeParse({ keyword });
  const validation = validationResult.success ? null : (validationResult.error.issues[0]?.message ?? null);
  const search = useInfiniteQuery({
    ...publicResourceListPolicy,
    queryKey: inspirationQueryKeys.search(queryKey),
    queryFn: ({ pageParam }) => searchInspirations(keyword, pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (page) => page.nextOffset,
    enabled: validation === null,
    retry: false,
  });
  const images = useMemo(() => deduplicate(search.data?.pages.flatMap((page) => page.items) ?? []), [search.data]);
  const detail = usePublicImageDetail(inspirationQueryKeys.search(queryKey), images, (image) =>
    updateInspirationInFeeds(queryClient, image),
  );
  const { fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } = search;
  const detailNavigation = useImageDetailNavigation({
    items: images,
    currentImageId: detail.imageId,
    onSelect: detail.navigate,
    hasNextPage: Boolean(hasNextPage),
    loadNextPage: async () => {
      const result = await fetchNextPage();
      return deduplicate(result.data?.pages.flatMap((page) => page.items) ?? images);
    },
  });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.get(queryKey) ?? 0 }));
    return () => {
      window.cancelAnimationFrame(frame);
      scrollPositions.set(queryKey, window.scrollY);
    };
  }, [queryKey]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasNextPage || isFetchingNextPage || isFetchNextPageError) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void fetchNextPage();
      },
      { rootMargin: "360px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError]);

  return (
    <main className="mx-auto max-w-[1720px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 space-y-4">
        <div>
          <Link
            href="/inspirations"
            className="rounded-[4px] text-sm font-medium text-[var(--accent)] transition hover:text-[var(--accent-hover)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            返回发现
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">搜索灵感</h1>
        </div>
        <InspirationSearchForm key={keyword} initialValue={keyword} />
        {validation === null ? <p className="text-sm text-muted-foreground">“{keyword}”的公开作品结果</p> : null}
      </header>

      {validation ? <State message={validation} /> : null}
      {search.isLoading ? <Skeleton /> : null}
      {search.isError && images.length === 0 ? (
        <ErrorState key={search.errorUpdatedAt} error={search.error} onRetry={() => void search.refetch()} />
      ) : null}
      {search.isSuccess && images.length === 0 ? <State message={`没有找到与“${keyword}”相关的公开作品。`} /> : null}
      {images.length ? (
        <ShortestLaneFeed
          items={images}
          getItemKey={(image) => image.id}
          getItemHeight={getWorkPreviewCardHeight}
          renderItem={(image, priority) => (
            <PublicInspirationCard
              sourceQueryKey={inspirationQueryKeys.search(queryKey)}
              image={image}
              priority={priority}
              onOpen={detail.open}
            />
          )}
        />
      ) : null}
      <div ref={loadMoreRef} className="min-h-12" aria-live="polite">
        {isFetchingNextPage ? <p className="pt-4 text-center text-sm text-muted-foreground">加载中…</p> : null}
        {isFetchNextPageError && images.length > 0 ? (
          <LoadMoreError key={search.errorUpdatedAt} error={search.error} onRetry={() => void fetchNextPage()} />
        ) : null}
        {search.isSuccess && images.length > 0 && !hasNextPage ? (
          <p className="pt-5 text-center text-xs text-muted-foreground">已展示当前关键词可查看的全部结果</p>
        ) : null}
      </div>
      {detail.image ? (
        <PublicImageDetailOverlay
          sourceQueryKey={detail.sourceQueryKey}
          image={detail.image}
          onClose={detail.close}
          onImageChange={detail.updateImage}
          navigation={detailNavigation}
        />
      ) : null}
      {detail.openError ? (
        <PublicImageOpenError message={detail.openError} onDismiss={detail.dismissOpenError} />
      ) : null}
    </main>
  );
}
