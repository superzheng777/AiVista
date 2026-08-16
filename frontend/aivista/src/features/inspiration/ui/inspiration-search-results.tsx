"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import { inspirationQueryKeys, searchInspirations } from "@/features/inspiration/api/inspiration-api";
import { searchQueryKey, validateSearchInput } from "@/features/inspiration/model/search-query";
import { InspirationSearchForm } from "@/features/inspiration/ui/inspiration-search-form";
import { MasonryFeed } from "@/features/inspiration/ui/masonry-feed";
import { PublicInspirationCard } from "@/features/inspiration/ui/public-inspiration-card";
import { getApiErrorCode, getRetryAfterSeconds } from "@/shared/api/api-response";

const scrollPositions = new Map<string, number>();

export function InspirationSearchResults({ keyword }: { keyword: string }) {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const queryKey = searchQueryKey(keyword);
  const validation = validateSearchInput(keyword);
  const search = useInfiniteQuery({
    queryKey: inspirationQueryKeys.search(queryKey),
    queryFn: ({ pageParam }) => searchInspirations(keyword, pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (page) => page.nextOffset,
    enabled: validation === null,
    retry: false,
  });
  const images = useMemo(() => deduplicate(search.data?.pages.flatMap((page) => page.items) ?? []), [search.data]);
  const { fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } = search;

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
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void fetchNextPage();
    }, { rootMargin: "360px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError]);

  return (
    <main className="mx-auto max-w-[1720px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 space-y-4">
        <div>
          <Link href="/inspirations" className="text-sm font-medium text-sky-600 hover:underline">返回发现</Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">搜索灵感</h1>
        </div>
        <InspirationSearchForm key={keyword} initialValue={keyword} />
        {validation === null ? <p className="text-sm text-muted-foreground">“{keyword}”的公开作品结果</p> : null}
      </header>

      {validation ? <State message={validation} /> : null}
      {search.isLoading ? <Skeleton /> : null}
      {search.isError && images.length === 0 ? <ErrorState key={search.errorUpdatedAt} error={search.error} onRetry={() => void search.refetch()} /> : null}
      {search.isSuccess && images.length === 0 ? <State message={`没有找到与“${keyword}”相关的公开作品。`} /> : null}
      {images.length ? <MasonryFeed images={images} renderCard={(image, priority) => <PublicInspirationCard image={image} priority={priority} />} /> : null}
      <div ref={loadMoreRef} className="min-h-12" aria-live="polite">
        {isFetchingNextPage ? <p className="pt-4 text-center text-sm text-muted-foreground">加载中…</p> : null}
        {isFetchNextPageError && images.length > 0 ? <LoadMoreError key={search.errorUpdatedAt} error={search.error} onRetry={() => void fetchNextPage()} /> : null}
        {search.isSuccess && images.length > 0 && !hasNextPage ? <p className="pt-5 text-center text-xs text-muted-foreground">已展示当前关键词可查看的全部结果</p> : null}
      </div>
    </main>
  );
}

function deduplicate(images: GenerationAsset[]): GenerationAsset[] {
  const seen = new Set<string>();
  return images.filter((image) => {
    if (seen.has(image.id)) return false;
    seen.add(image.id);
    return true;
  });
}

function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const code = getApiErrorCode(error);
  const message = code === 42904 ? "搜索请求过于频繁，请稍后再试。"
    : code === 50301 ? "搜索服务暂不可用，发现和关注列表仍可正常使用。"
    : "搜索结果加载失败。";
  return <section role="alert" className="rounded-2xl border border-destructive/20 bg-card p-8 text-center"><p className="text-sm text-destructive">{message}</p><RetryButton error={error} onRetry={onRetry} label="重新加载" /></section>;
}

function LoadMoreError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const code = getApiErrorCode(error);
  const message = code === 42904 ? "加载过于频繁。" : code === 50301 ? "搜索服务暂不可用。" : "继续加载失败。";
  return <div role="alert" className="pt-4 text-center"><p className="text-sm text-destructive">{message}</p><RetryButton error={error} onRetry={onRetry} label="重试加载" /></div>;
}

function RetryButton({ error, onRetry, label }: { error: unknown; onRetry: () => void; label: string }) {
  const [retryAfter, setRetryAfter] = useState(() => getApiErrorCode(error) === 42904 ? getRetryAfterSeconds(error) : 0);
  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = window.setTimeout(() => setRetryAfter((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [retryAfter]);
  return <button type="button" disabled={retryAfter > 0} onClick={onRetry} className="mt-3 text-sm font-medium underline disabled:cursor-not-allowed disabled:opacity-50">{retryAfter > 0 ? `${retryAfter} 秒后可重试` : label}</button>;
}

function State({ message }: { message: string }) {
  return <section className="rounded-2xl border border-dashed border-border p-10 text-center"><p className="text-sm text-muted-foreground">{message}</p></section>;
}

function Skeleton() {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="aspect-square animate-pulse rounded-2xl bg-muted" />)}</div>;
}
