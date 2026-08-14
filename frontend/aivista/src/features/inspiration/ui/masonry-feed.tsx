"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { GenerationAsset } from "@/entities/generation/model/generation";

const LANE_GAP = 16;
const MIN_LANE_WIDTH = 220;
const MAX_LANES = 5;
const CARD_META_HEIGHT = 52;

type PositionedItem = { image: GenerationAsset; left: number; top: number; width: number };

function getLaneCount(containerWidth: number) {
  return Math.max(1, Math.min(MAX_LANES, Math.floor((containerWidth + LANE_GAP) / (MIN_LANE_WIDTH + LANE_GAP))));
}

function getImageHeight(image: GenerationAsset, laneWidth: number) {
  if (image.width <= 0 || image.height <= 0) return laneWidth;
  return laneWidth * (image.height / image.width);
}

function useContainerWidth() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateWidth = () => setContainerWidth(Math.round(container.getBoundingClientRect().width));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return { containerRef, containerWidth };
}

function layoutImages(images: GenerationAsset[], containerWidth: number) {
  if (containerWidth <= 0) return { items: [] as PositionedItem[], height: 0 };
  const laneCount = getLaneCount(containerWidth);
  const laneWidth = (containerWidth - LANE_GAP * (laneCount - 1)) / laneCount;
  const laneHeights = Array.from({ length: laneCount }, () => 0);
  const items: PositionedItem[] = [];

  for (const image of images) {
    let laneIndex = 0;
    for (let index = 1; index < laneHeights.length; index += 1) {
      if (laneHeights[index] < laneHeights[laneIndex]) laneIndex = index;
    }
    const top = laneHeights[laneIndex];
    items.push({ image, left: laneIndex * (laneWidth + LANE_GAP), top, width: laneWidth });
    laneHeights[laneIndex] += getImageHeight(image, laneWidth) + CARD_META_HEIGHT + LANE_GAP;
  }

  return { items, height: Math.max(0, ...laneHeights) - (images.length ? LANE_GAP : 0) };
}

export function MasonryFeed({ images, renderCard }: { images: GenerationAsset[]; renderCard: (image: GenerationAsset, priority: boolean) => ReactNode }) {
  const { containerRef, containerWidth } = useContainerWidth();
  const layout = useMemo(() => layoutImages(images, containerWidth), [images, containerWidth]);

  return <div ref={containerRef} className="relative w-full" style={{ height: layout.height }} aria-busy={containerWidth <= 0}>{layout.items.map(({ image, left, top, width }, index) => <div key={image.id} className="absolute" style={{ left, top, width }}>{renderCard(image, index < 4)}</div>)}</div>;
}
