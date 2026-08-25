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
import { InspirationSearchForm } from "@/features/inspiration/ui/inspiration-search-form";
import { PublicInspirationCard } from "@/features/inspiration/ui/public-inspiration-card";
import { PublicImageDetailOverlay } from "@/features/inspiration/ui/public-image-detail-overlay";
import { PublicImageOpenError } from "@/features/inspiration/ui/public-image-open-error";
import { usePublicImageDetail } from "@/features/inspiration/model/use-public-image-detail";
import { getPublicAuthor } from "@/features/public-user/api/public-user-api";
import { cn } from "@/lib/utils";
import { AccentSquare, DotMatrix } from "@/shared/ui/editorial-ornaments/editorial-ornaments";
import { ShortestLaneFeed } from "@/shared/ui/shortest-lane-feed/shortest-lane-feed";
import { getWorkPreviewCardHeight } from "@/shared/ui/work-preview-card/work-preview-card";

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
    <main className="min-h-dvh bg-[#f5f0e6] px-4 py-7 text-[#171612] sm:px-8 sm:py-9 lg:px-12 lg:py-[34px]">
      <div className="mx-auto w-full max-w-[1640px]">
      <header className="relative min-h-[126px]"><p className="text-[11px] font-semibold leading-none tracking-[0.16em] text-[#716b61]"><span className="text-[#c95f3f]">01</span> / EXPLORE</p><h1 className="mt-[14px] text-[32px] font-bold leading-[1.2] tracking-tight sm:text-4xl">灵感探索</h1><p className="mt-3 text-[15px] leading-6 text-[#716b61]">发现来自社区的公开作品，找到下一次创作灵感</p><div aria-hidden="true" className="pointer-events-none absolute left-[52%] top-3 hidden h-[52px] w-[82px] lg:block"><DotMatrix columns={5} rows={3} dotSize={3} gap={7} className="absolute left-0 top-0" /><AccentSquare size={14} className="absolute bottom-0 right-0" /></div></header>
      <nav aria-label="作品列表" className="flex h-[62px] items-end justify-between border-b border-[#d9cfbf]">
        <FeedTab href="/inspirations" active={!following}>发现</FeedTab>
        <FeedTab href="/inspirations?view=following" active={following}>关注</FeedTab>
        <InspirationSearchForm compact />
      </nav>

      <section className="mb-3 mt-[18px] flex items-center"><h2 className="shrink-0 text-lg font-bold">{following ? "关注作品" : "今日灵感"}</h2><p className="ml-5 shrink-0 text-[13px] text-[#716b61] sm:ml-[30px]">{following ? "来自你关注的创作者" : "持续发现新的视觉表达"}</p><span className="ml-4 h-px flex-1 bg-[#d9cfbf] sm:ml-[18px]" /><AccentSquare size={8} className="ml-4 shrink-0" /></section>

      {following && status === "anonymous" ? (
        <EmptyState message="登录后即可查看你所关注作者的最新作品。" action="登录" onAction={openAuthDialog} />
      ) : null}
      {following && status === "error" ? (
        <EmptyState message="暂时无法确认登录状态。" action="重新尝试" onAction={() => void restoreSession()} />
      ) : null}
      {following && status === "loading" ? <FeedSkeleton /> : null}
      {enabled && inspirations.isLoading ? <FeedSkeleton /> : null}
      {enabled && inspirations.isError ? (
        <section role="alert" className="border border-[#debda9] bg-[#fffdf7] p-8 text-center">
          <p className="text-sm text-[#ae4d33]">{following ? "关注列表加载失败。" : "发现列表加载失败。"}</p>
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
        <ShortestLaneFeed items={images} getItemKey={(image) => image.id} getItemHeight={getWorkPreviewCardHeight} renderItem={(image, priority) => <PublicInspirationCard image={image} priority={priority} onOpen={detail.open} />} />
      ) : null}
      {enabled ? (
        <div ref={loadMoreRef} className="min-h-12" aria-live="polite">
          {isFetchingNextPage ? <p className="pt-4 text-center text-sm text-[#716b61]">正在加载更多</p> : null}
          {isFetchNextPageError ? <button type="button" onClick={() => void fetchNextPage()} className="mx-auto mt-4 block text-sm font-medium underline">继续加载失败，点击重试</button> : null}
        </div>
      ) : null}
    {detail.image ? <PublicImageDetailOverlay image={detail.image} onClose={detail.close} onImageChange={detail.updateImage} /> : null}
    {detail.openError ? <PublicImageOpenError message={detail.openError} onDismiss={detail.dismissOpenError} /> : null}
      </div></main>
  );
}

function FeedTab({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link href={href} scroll={false} aria-current={active ? "page" : undefined}
      className={cn("relative mr-10 flex h-full items-center text-[17px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2", active ? "font-semibold text-[#171612]" : "text-[#716b61] hover:text-[#171612]")}>
      {children}
      {active ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#171612]" aria-hidden /> : null}
    </Link>
  );
}

function FeedSkeleton() {
  return <div className="columns-2 gap-[18px] sm:columns-3 lg:columns-4 min-[1600px]:columns-5">{Array.from({ length: 10 }, (_, index) => <div key={index} className="mb-[18px] break-inside-avoid animate-pulse overflow-hidden rounded-[8px] border border-[#d9cfbf] bg-[#fffdf7]"><div className={cn("bg-[#e7ddce]", index % 3 === 0 ? "h-72" : index % 3 === 1 ? "h-48" : "h-60")} /><div className="h-[52px] border-t border-[#d9cfbf]" /></div>)}</div>;
}

function EmptyState({ message, action, href, onAction }: { message: string; action?: string; href?: string; onAction?: () => void }) {
  return (
    <section className="mx-auto mt-24 max-w-[420px] text-center"><div aria-hidden="true" className="relative mx-auto h-14 w-16"><span className="absolute left-2 top-0 size-9 border border-[#716b61]" /><span className="absolute bottom-0 right-1 size-9 border border-[#171612]" /><AccentSquare size={8} className="absolute bottom-1 left-0" /><span className="absolute right-0 top-0 text-lg leading-none">✦</span></div>
      <p className="mt-5 text-sm text-[#716b61]">{message}</p>
      {action && href ? <Link href={href} className="mt-4 inline-flex text-sm font-medium text-[#c95f3f] hover:underline">{action}</Link> : null}
      {action && onAction ? <button type="button" onClick={onAction} className="mt-4 text-sm font-medium text-[#c95f3f] hover:underline">{action}</button> : null}
    </section>
  );
}
