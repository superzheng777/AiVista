"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { inspirationQueryKeys, listInspirations } from "@/features/inspiration/api/inspiration-api";
import { MasonryFeed } from "@/features/inspiration/ui/masonry-feed";
import { PublicInspirationCard } from "@/features/inspiration/ui/public-inspiration-card";

export function InspirationHome() {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const inspirations = useInfiniteQuery({ queryKey: inspirationQueryKeys.all, queryFn: ({ pageParam }) => listInspirations(pageParam), initialPageParam: null as string | null, getNextPageParam: (page) => page.nextCursor });
  const images = inspirations.data?.pages.flatMap((page) => page.items) ?? [];
  const { fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } = inspirations;
  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasNextPage || isFetchingNextPage || isFetchNextPageError) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) void fetchNextPage(); }, { rootMargin: "360px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError]);
  return <main className="mx-auto max-w-[1720px] px-4 py-8 sm:px-6 lg:px-8"><header className="mb-7"><p className="text-sm font-medium text-sky-600">灵感探索</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">公开作品</h1><p className="mt-2 text-sm text-muted-foreground">发现创作，打开详情后可查看作者与互动。</p></header>{inspirations.isLoading ? <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="aspect-square animate-pulse rounded-2xl bg-muted" />)}</div> : null}{inspirations.isError ? <section role="alert" className="rounded-2xl border border-destructive/20 bg-card p-8 text-center"><p className="text-sm text-destructive">灵感列表加载失败。</p><button type="button" onClick={() => void inspirations.refetch()} className="mt-3 text-sm font-medium underline">重新加载</button></section> : null}{!inspirations.isLoading && !inspirations.isError && !images.length ? <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">暂时还没有公开作品。</p> : null}{images.length ? <MasonryFeed images={images} renderCard={(image, priority) => <PublicInspirationCard image={image} priority={priority} />} /> : null}<div ref={loadMoreRef} className="min-h-12" aria-live="polite">{isFetchingNextPage ? <p className="pt-4 text-center text-sm text-muted-foreground">加载中…</p> : null}{isFetchNextPageError ? <button type="button" onClick={() => void fetchNextPage()} className="mx-auto mt-4 block text-sm font-medium underline">继续加载失败，点击重试</button> : null}</div></main>;
}
