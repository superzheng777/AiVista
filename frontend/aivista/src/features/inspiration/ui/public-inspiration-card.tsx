"use client";

/* eslint-disable @next/next/no-img-element */

import {
  isImageUrlExpired,
  needsImageUrlRefresh,
  type GenerationAsset,
} from "@/entities/image-resource/model/image-resource";
import { useAuthDialogStore } from "@/features/auth/model/auth-dialog-store";
import { useAuthStore } from "@/features/auth/model/auth-store";
import {
  WorkPreviewCardImage,
  WorkPreviewCardInfoBar,
  WorkPreviewCardSurface,
} from "@/shared/ui/work-preview-card/work-preview-card";
import type { QueryKey } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { Heart, MoreHorizontal, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { getInspiration } from "../api/inspiration-api";
import { discardUnavailableInspiration, updateInspirationInFeeds } from "../model/inspiration-cache";
import { useImageLike } from "../model/use-image-like";

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
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setNearViewport(true);
        observer.disconnect();
      },
      { rootMargin: "360px" },
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearViewport) return;
    let cancelled = false;
    async function setCurrentSource() {
      // An early renewal must not hide the still-valid image while the request runs.
      if (!isImageUrlExpired(thumbnail)) setSource(thumbnail?.url ?? null);
      if (!needsImageUrlRefresh(thumbnail)) return;
      try {
        const refreshed = await getInspiration(image.id);
        if (!cancelled) {
          setSource(refreshed.imageUrls.thumbnail?.url ?? null);
          updateInspirationInFeeds(queryClient, refreshed);
        }
      } catch (error) {
        discardUnavailableInspiration(queryClient, image.id, error);
      }
    }
    void setCurrentSource();
    return () => {
      cancelled = true;
    };
  }, [image.id, nearViewport, queryClient, thumbnail]);

  async function refreshAfterError() {
    if (retryUsedRef.current) return;
    retryUsedRef.current = true;
    try {
      const refreshed = await getInspiration(image.id);
      setSource(refreshed.imageUrls.thumbnail?.url ?? null);
      updateInspirationInFeeds(queryClient, refreshed);
    } catch (error) {
      discardUnavailableInspiration(queryClient, image.id, error);
      // Keep the failed image state instead of retrying indefinitely.
    }
  }
  return { cardRef, source, refreshAfterError };
}

export function PublicInspirationCard({
  image,
  sourceQueryKey,
  priority = false,
  onOpen,
}: {
  image: GenerationAsset;
  sourceQueryKey: QueryKey;
  priority?: boolean;
  onOpen?: (image: GenerationAsset) => void | Promise<void>;
}) {
  const { cardRef, source, refreshAfterError } = useVisibleImageSource(image, priority);
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const openAuthDialog = useAuthDialogStore((state) => state.open);
  const like = useImageLike({ image, sourceQueryKey, userId: user?.id });
  const detailHref = `/inspirations?imageId=${encodeURIComponent(image.id)}`;
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      !onOpen ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    void onOpen(image);
  };
  const toggleLike = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (status !== "authenticated") {
      openAuthDialog();
      return;
    }
    like.toggle();
  };
  const likeLabel = `${image.likedByCurrentUser ? "取消点赞" : "点赞"}，当前 ${image.likeCount} 个赞`;
  const likeControl = (
    <>
      {like.errorMessage ? (
        <span role="status" className="text-xs text-[var(--primary)]">
          {like.errorMessage}
        </span>
      ) : null}
      <button
        type="button"
        aria-label={likeLabel}
        aria-pressed={image.likedByCurrentUser}
        disabled={like.isPending}
        onClick={toggleLike}
        className="inline-flex h-8 shrink-0 items-center gap-[5px] rounded-[5px] px-2 text-[13px] text-[var(--text-secondary)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Heart className={`size-4 ${image.likedByCurrentUser ? "fill-[var(--accent)] text-[var(--accent)]" : ""}`} />
        {image.likeCount}
      </button>
    </>
  );
  return (
    <article ref={cardRef} className="group w-full">
      <WorkPreviewCardSurface>
        <WorkPreviewCardImage image={image}>
          <Link href={detailHref} prefetch={false} onClick={open} className="block size-full">
            {source ? (
              <img
                src={source}
                alt={image.title ?? "公开作品"}
                loading={priority ? "eager" : "lazy"}
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => void refreshAfterError()}
                className="block size-full object-cover"
              />
            ) : (
              <span className="absolute inset-0 animate-pulse bg-[var(--skeleton)]" aria-hidden />
            )}
          </Link>
          {source ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[var(--primary)]/[0.28] opacity-0 transition-opacity group-hover:opacity-100"
            />
          ) : null}
          <div
            aria-hidden="true"
            className="absolute right-3 top-3 z-10 flex gap-2 opacity-0 transition group-hover:opacity-100"
          >
            <span className="grid size-9 place-items-center rounded-[6px] bg-[var(--primary)]/90 text-[var(--surface-bg)]">
              <Heart className="size-4" />
            </span>
            <span className="grid size-9 place-items-center rounded-[6px] bg-[var(--primary)]/90 text-[var(--surface-bg)]">
              <MoreHorizontal className="size-5" />
            </span>
          </div>
          <Link
            href="/generate"
            className="absolute bottom-[14px] left-1/2 z-10 inline-flex h-[38px] -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-[7px] bg-[var(--primary)]/90 px-[18px] text-xs font-medium text-[var(--surface-bg)] opacity-0 transition group-hover:opacity-100"
          >
            <Sparkles className="size-4" />
            以此为灵感
          </Link>
        </WorkPreviewCardImage>
        <WorkPreviewCardInfoBar title={image.title ?? "未命名作品"} trailing={likeControl} />
      </WorkPreviewCardSurface>
    </article>
  );
}
