"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { useAuthDialog } from "@/features/auth/model/auth-dialog-provider";
import { useSession } from "@/features/auth/model/session-provider";
import {
  inspirationQueryKeys,
  listFollowingInspirations,
  listInspirations,
} from "@/features/inspiration/api/inspiration-api";
import { MasonryFeed } from "@/features/inspiration/ui/masonry-feed";
import { InspirationSearchForm } from "@/features/inspiration/ui/inspiration-search-form";
import { PublicInspirationCard } from "@/features/inspiration/ui/public-inspiration-card";
import { PublicImageDetailOverlay } from "@/features/inspiration/ui/public-image-detail-overlay";
import { PublicImageOpenError } from "@/features/inspiration/ui/public-image-open-error";
import { usePublicImageDetail } from "@/features/inspiration/model/use-public-image-detail";
import { getPublicAuthor } from "@/features/public-user/api/public-user-api";
import { cn } from "@/lib/utils";

export type InspirationFeedView = "discovery" | "following";

const scrollPositions: Record<InspirationFeedView, number> = { discovery: 0, following: 0 };

export function InspirationHome({ view = "discovery" }: { view?: InspirationFeedView }) {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const { status, user, restoreSession } = useSession();
  const { open: openAuthDialog } = useAuthDialog();
  const detail = usePublicImageDetail();
  const following = view === "following";
  const enabled = !following || status === "authenticated";
  const inspirations = useInfiniteQuery({
    queryKey: following ? inspirationQueryKeys.following : inspirationQueryKeys.discovery,
    queryFn: ({ pageParam }) => following ? listFollowingInspirations(pageParam) : listInspirations(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled,
  });
  const images = inspirations.data?.pages.flatMap((page) => page.items) ?? [];
  const selfProfile = useQuery({
    queryKey: ["public-author", user?.id],
    queryFn: () => getPublicAuthor(user!.id),
    enabled: following && status === "authenticated" && inspirations.isSuccess && images.length === 0 && Boolean(user),
  });
  const { fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } = inspirations;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => window.scrollTo({ top: scrollPositions[view] }));
    return () => {
      window.cancelAnimationFrame(frame);
      scrollPositions[view] = window.scrollY;
    };
  }, [view]);

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
      <header className="mb-6">
        <p className="text-sm font-medium text-sky-600">灵感探索</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">公开作品</h1>
        <p className="mt-2 text-sm text-muted-foreground">发现最新创作，或查看你所关注作者的公开作品。</p>
      </header>

      <nav aria-label="作品列表" className="sticky top-0 z-20 mb-6 flex border-b border-border bg-background/95 backdrop-blur">
        <FeedTab href="/inspirations" active={!following}>发现</FeedTab>
        <FeedTab href="/inspirations?view=following" active={following}>关注</FeedTab>
        <InspirationSearchForm compact />
      </nav>

      {following && status === "anonymous" ? (
        <EmptyState message="登录后即可查看你所关注作者的最新作品。" action="登录" onAction={openAuthDialog} />
      ) : null}
      {following && status === "error" ? (
        <EmptyState message="暂时无法确认登录状态。" action="重新尝试" onAction={() => void restoreSession()} />
      ) : null}
      {following && status === "loading" ? <FeedSkeleton /> : null}
      {enabled && inspirations.isLoading ? <FeedSkeleton /> : null}
      {enabled && inspirations.isError ? (
        <section role="alert" className="rounded-2xl border border-destructive/20 bg-card p-8 text-center">
          <p className="text-sm text-destructive">{following ? "关注列表加载失败。" : "发现列表加载失败。"}</p>
          <button type="button" onClick={() => void inspirations.refetch()} className="mt-3 text-sm font-medium underline">重新加载</button>
        </section>
      ) : null}
      {enabled && inspirations.isSuccess && images.length === 0 ? (
        <EmptyState message={following && selfProfile.isLoading
          ? "正在确认关注状态…"
          : following
          ? selfProfile.data?.followingCount === 0
            ? "你还没有关注创作者，可以先去发现列表寻找喜欢的作品。"
            : "你关注的作者暂时还没有公开作品。"
          : "暂时还没有公开作品。"}
          action={following && selfProfile.data?.followingCount === 0 ? "浏览发现" : undefined}
          href={following && selfProfile.data?.followingCount === 0 ? "/inspirations" : undefined} />
      ) : null}
      {images.length ? (
        <MasonryFeed images={images} renderCard={(image, priority) => <PublicInspirationCard image={image} priority={priority} onOpen={detail.open} />} />
      ) : null}
      {enabled ? (
        <div ref={loadMoreRef} className="min-h-12" aria-live="polite">
          {isFetchingNextPage ? <p className="pt-4 text-center text-sm text-muted-foreground">加载中…</p> : null}
          {isFetchNextPageError ? <button type="button" onClick={() => void fetchNextPage()} className="mx-auto mt-4 block text-sm font-medium underline">继续加载失败，点击重试</button> : null}
        </div>
      ) : null}
    {detail.image ? <PublicImageDetailOverlay image={detail.image} onClose={detail.close} onImageChange={detail.updateImage} /> : null}
    {detail.openError ? <PublicImageOpenError message={detail.openError} onDismiss={detail.dismissOpenError} /> : null}
    </main>
  );
}

function FeedTab({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link href={href} scroll={false} aria-current={active ? "page" : undefined}
      className={cn("relative px-5 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2", active ? "text-sky-600" : "text-muted-foreground hover:text-foreground")}>
      {children}
      {active ? <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-sky-500" aria-hidden /> : null}
    </Link>
  );
}

function FeedSkeleton() {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="aspect-square animate-pulse rounded-2xl bg-muted" />)}</div>;
}

function EmptyState({ message, action, href, onAction }: { message: string; action?: string; href?: string; onAction?: () => void }) {
  return (
    <section className="rounded-2xl border border-dashed border-border p-10 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      {action && href ? <Link href={href} className="mt-4 inline-flex text-sm font-medium text-sky-600 hover:underline">{action}</Link> : null}
      {action && onAction ? <button type="button" onClick={onAction} className="mt-4 text-sm font-medium text-sky-600 hover:underline">{action}</button> : null}
    </section>
  );
}
