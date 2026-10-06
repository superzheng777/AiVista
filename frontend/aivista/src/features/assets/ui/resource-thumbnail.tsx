"use client";
/* eslint-disable @next/next/no-img-element */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";

import { needsImageUrlRefresh, type GenerationAsset } from "@/entities/generation/model/generation";
import { patchResource } from "@/entities/generation/model/resource-cache";
import { getGenerationAsset } from "@/features/assets/api/asset-api";
import { getInspiration } from "@/features/inspiration/api/inspiration-api";
import {
  discardUnavailableInspiration,
  updateInspirationInFeeds,
} from "@/features/inspiration/model/inspiration-cache";

/** Refresh only the visible image, without replacing the surrounding list. */
export function ResourceThumbnail({
  image,
  access = "private",
  alt,
  ...props
}: Omit<ComponentProps<"img">, "src" | "onError"> & {
  image: GenerationAsset;
  access?: "private" | "public";
  alt: string;
}) {
  const client = useQueryClient();
  const element = useRef<HTMLImageElement>(null);
  const retried = useRef<string | null>(null);
  const failedRetryUsed = useRef(false);
  const [refreshed, setRefreshed] = useState<{ image: GenerationAsset; requestedUrl: string | undefined } | null>(null);
  const thumbnail = image.imageUrls.thumbnail ?? image.imageUrls.display;
  const replacement =
    refreshed?.image.id === image.id && refreshed.requestedUrl === thumbnail?.url
      ? (refreshed.image.imageUrls.thumbnail ?? refreshed.image.imageUrls.display)
      : null;
  const source = replacement && !needsImageUrlRefresh(replacement) ? replacement : thumbnail;
  const expired = needsImageUrlRefresh(source);

  const refresh = useCallback(async () => {
    const key = `${image.id}:${thumbnail?.url}`;
    if (retried.current === key) return;
    retried.current = key;
    try {
      const result = await (access === "private" ? getGenerationAsset(image.id) : getInspiration(image.id));
      setRefreshed({ image: result, requestedUrl: thumbnail?.url });
      if (access === "private") patchResource(client, image.id, { imageUrls: result.imageUrls });
      else updateInspirationInFeeds(client, result);
    } catch (error) {
      if (access === "public") discardUnavailableInspiration(client, image.id, error);
      // An unavailable image must not cause a retry loop or refresh the whole list.
    }
  }, [access, client, image.id, thumbnail]);

  useEffect(() => {
    if (!expired || !source || !element.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();
        void refresh();
      },
      { rootMargin: "360px" },
    );
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [source, expired, refresh]);

  return (
    <img
      {...props}
      ref={element}
      alt={alt}
      src={expired ? undefined : source?.url}
      onError={() => {
        if (failedRetryUsed.current) return;
        failedRetryUsed.current = true;
        void refresh();
      }}
    />
  );
}
