"use client";

import { useCallback, useRef, useState } from "react";

import type { GenerationAsset } from "@/entities/generation/model/generation";

export type ImageDetailNavigation = {
  hasPrevious: boolean;
  hasNext: boolean;
  pending: boolean;
  previous: () => void;
  next: () => void;
};

type ImageDetailNavigationOptions = {
  items: GenerationAsset[];
  currentImageId: string | null;
  onSelect: (image: GenerationAsset) => void | Promise<void>;
  hasPreviousPage?: boolean;
  loadPreviousPage?: () => Promise<GenerationAsset[]>;
  hasNextPage?: boolean;
  loadNextPage?: () => Promise<GenerationAsset[]>;
};

export function useImageDetailNavigation({
  items,
  currentImageId,
  onSelect,
  hasPreviousPage = false,
  loadPreviousPage,
  hasNextPage = false,
  loadNextPage,
}: ImageDetailNavigationOptions): ImageDetailNavigation {
  const [pending, setPending] = useState(false);
  const movingRef = useRef(false);
  const currentIndex = currentImageId ? items.findIndex((item) => item.id === currentImageId) : -1;
  const hasPrevious = currentIndex > 0 || (currentIndex === 0 && hasPreviousPage && Boolean(loadPreviousPage));
  const hasNext = currentIndex >= 0 && (currentIndex < items.length - 1 || (hasNextPage && Boolean(loadNextPage)));

  const move = useCallback(
    async (direction: -1 | 1) => {
      if (!currentImageId || movingRef.current) return;
      let candidates = items;
      let index = candidates.findIndex((item) => item.id === currentImageId);
      if (index < 0) return;

      movingRef.current = true;
      setPending(true);
      try {
        if (direction < 0 && index === 0 && hasPreviousPage && loadPreviousPage) {
          candidates = await loadPreviousPage();
          index = candidates.findIndex((item) => item.id === currentImageId);
        } else if (direction > 0 && index === candidates.length - 1 && hasNextPage && loadNextPage) {
          candidates = await loadNextPage();
          index = candidates.findIndex((item) => item.id === currentImageId);
        }
        const target = candidates[index + direction];
        if (target) await onSelect(target);
      } catch {
        // The owning page already exposes its pagination or image-open error state.
      } finally {
        movingRef.current = false;
        setPending(false);
      }
    },
    [currentImageId, hasNextPage, hasPreviousPage, items, loadNextPage, loadPreviousPage, onSelect],
  );

  return {
    hasPrevious,
    hasNext,
    pending,
    previous: () => void move(-1),
    next: () => void move(1),
  };
}
