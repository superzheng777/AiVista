"use client";
/* eslint-disable @next/next/no-img-element */

import { Heart, MoreHorizontal, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { needsImageUrlRefresh, type GenerationAsset } from "@/entities/generation/model/generation";
import { getInspiration } from "@/features/inspiration/api/inspiration-api";
import { updateInspirationInFeeds } from "@/features/inspiration/model/inspiration-cache";
import { WorkPreviewCardImage, WorkPreviewCardInfoBar, WorkPreviewCardLikes, WorkPreviewCardSurface } from "@/shared/ui/work-preview-card/work-preview-card";

function useVisibleImageSource(image: GenerationAsset, priority: boolean) {
  const queryClient = useQueryClient();
  const cardRef = useRef<HTMLElement>(null);
  const retryUsedRef = useRef(false);
  const [nearViewport, setNearViewport] = useState(priority);
  const [source, setSource] = useState<string | null>(null);
  const thumbnail = image.imageUrls.thumbnail;

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setNearViewport(true);
      observer.disconnect();
    }, { rootMargin: "360px" });
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearViewport) return;
    let cancelled = false;
    async function setCurrentSource() {
      if (!needsImageUrlRefresh(thumbnail)) {
        if (!cancelled) setSource(thumbnail?.url ?? null);
        return;
      }
      try {
        const refreshed = await getInspiration(image.id);
        if (!cancelled) {
          setSource(refreshed.imageUrls.thumbnail?.url ?? null);
          updateInspirationInFeeds(queryClient, refreshed);
        }
      } catch {
        if (!cancelled) setSource(thumbnail?.url ?? null);
      }
    }
    void setCurrentSource();
    return () => { cancelled = true; };
  }, [image.id, nearViewport, queryClient, thumbnail]);

  async function refreshAfterError() {
    if (retryUsedRef.current) return;
    retryUsedRef.current = true;
    try {
      const refreshed = await getInspiration(image.id);
      setSource(refreshed.imageUrls.thumbnail?.url ?? null);
      updateInspirationInFeeds(queryClient, refreshed);
    } catch {
      // Keep the failed image state instead of retrying indefinitely.
    }
  }
  return { cardRef, source, refreshAfterError };
}

export function PublicInspirationCard({ image, priority = false, onOpen }: { image: GenerationAsset; priority?: boolean; onOpen?: (image: GenerationAsset) => void | Promise<void> }) {
  const { cardRef, source, refreshAfterError } = useVisibleImageSource(image, priority);
  const detailHref = `/inspirations?imageId=${encodeURIComponent(image.id)}`;
  const open = (event: MouseEvent<HTMLAnchorElement>) => { if (!onOpen || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); void onOpen(image); };
  return <article ref={cardRef} className="group w-full"><WorkPreviewCardSurface><WorkPreviewCardImage image={image}><Link href={detailHref} prefetch={false} onClick={open} className="block size-full">{source ? <img src={source} alt={image.title ?? "公开作品"} loading={priority ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" onError={() => void refreshAfterError()} className="block size-full object-cover" /> : <span className="absolute inset-0 animate-pulse bg-[#e7ddce]" aria-hidden />}</Link>{source ? <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[#171612]/[0.28] opacity-0 transition-opacity group-hover:opacity-100" /> : null}<div aria-hidden="true" className="absolute right-3 top-3 z-10 flex gap-2 opacity-0 transition group-hover:opacity-100"><span className="grid size-9 place-items-center rounded-[6px] bg-[#171612]/90 text-[#fffdf7]"><Heart className="size-4" /></span><span className="grid size-9 place-items-center rounded-[6px] bg-[#171612]/90 text-[#fffdf7]"><MoreHorizontal className="size-5" /></span></div><Link href="/generate" className="absolute bottom-[14px] left-1/2 z-10 inline-flex h-[38px] -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-[7px] bg-[#171612]/90 px-[18px] text-xs font-medium text-[#fffdf7] opacity-0 transition group-hover:opacity-100"><Sparkles className="size-4" />以此为灵感</Link></WorkPreviewCardImage><WorkPreviewCardInfoBar title={image.title ?? "未命名作品"} trailing={<WorkPreviewCardLikes count={image.likeCount} />} /></WorkPreviewCardSurface></article>;
}
