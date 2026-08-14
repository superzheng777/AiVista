"use client";
/* eslint-disable @next/next/no-img-element */

import { Heart } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { needsImageUrlRefresh, type GenerationAsset } from "@/entities/generation/model/generation";
import { getInspiration } from "@/features/inspiration/api/inspiration-api";

function useVisibleImageSource(image: GenerationAsset, priority: boolean) {
  const cardRef = useRef<HTMLAnchorElement>(null);
  const retryUsedRef = useRef(false);
  const [nearViewport, setNearViewport] = useState(priority);
  const [source, setSource] = useState<string | null>(null);

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
      if (!needsImageUrlRefresh(image.urlExpiresAt)) {
        if (!cancelled) setSource(image.url);
        return;
      }
      try {
        const refreshed = await getInspiration(image.id);
        if (!cancelled) setSource(refreshed.url);
      } catch {
        if (!cancelled) setSource(image.url);
      }
    }
    void setCurrentSource();
    return () => { cancelled = true; };
  }, [image.id, image.url, image.urlExpiresAt, nearViewport]);

  async function refreshAfterError() {
    if (retryUsedRef.current) return;
    retryUsedRef.current = true;
    try {
      const refreshed = await getInspiration(image.id);
      setSource(refreshed.url);
    } catch {
      // Keep the failed image state instead of retrying indefinitely.
    }
  }
  return { cardRef, source, refreshAfterError };
}

export function PublicInspirationCard({ image, priority = false }: { image: GenerationAsset; priority?: boolean }) {
  const { cardRef, source, refreshAfterError } = useVisibleImageSource(image, priority);
  const aspectRatio = image.width > 0 && image.height > 0 ? `${image.width} / ${image.height}` : "1 / 1";
  return <Link ref={cardRef} href={`/inspirations/${image.id}`} className="group block overflow-hidden rounded-2xl bg-card text-left shadow-sm ring-1 ring-border transition hover:-translate-y-0.5 hover:shadow-md"><div className="relative w-full bg-muted" style={{ aspectRatio }}>{source ? <img src={source} alt={image.title ?? "公开作品"} loading={priority ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" onError={() => void refreshAfterError()} className="absolute inset-0 size-full object-cover" /> : <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden />}</div><div className="flex h-[52px] items-center justify-between gap-3 p-3"><p className="min-w-0 truncate text-sm font-medium">{image.title ?? "未命名作品"}</p><span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Heart className="size-3.5" />{image.likeCount}</span></div></Link>;
}
