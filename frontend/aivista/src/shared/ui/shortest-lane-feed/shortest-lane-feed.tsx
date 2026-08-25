"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type ShortestLaneFeedProps<T> = {
  items: readonly T[];
  getItemKey: (item: T) => string;
  /** Returns the complete card height for a lane of the given width. */
  getItemHeight: (item: T, laneWidth: number) => number;
  renderItem: (item: T, priority: boolean) => ReactNode;
  minLaneWidth?: number;
  maxLanes?: number;
  gap?: number;
  priorityCount?: number;
  className?: string;
};

type PositionedItem<T> = { item: T; left: number; top: number; width: number };

function getLaneCount(containerWidth: number, minLaneWidth: number, maxLanes: number, gap: number) {
  return Math.max(1, Math.min(maxLanes, Math.floor((containerWidth + gap) / (minLaneWidth + gap))));
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

function layoutItems<T>(items: readonly T[], containerWidth: number, getItemHeight: (item: T, laneWidth: number) => number, minLaneWidth: number, maxLanes: number, gap: number) {
  if (containerWidth <= 0) return { items: [] as PositionedItem<T>[], height: 0 };
  const laneCount = getLaneCount(containerWidth, minLaneWidth, maxLanes, gap);
  const laneWidth = (containerWidth - gap * (laneCount - 1)) / laneCount;
  const laneHeights = Array.from({ length: laneCount }, () => 0);
  const positionedItems: PositionedItem<T>[] = [];

  for (const item of items) {
    let laneIndex = 0;
    for (let index = 1; index < laneHeights.length; index += 1) {
      if (laneHeights[index] < laneHeights[laneIndex]) laneIndex = index;
    }
    const top = laneHeights[laneIndex];
    positionedItems.push({ item, left: laneIndex * (laneWidth + gap), top, width: laneWidth });
    laneHeights[laneIndex] += getItemHeight(item, laneWidth) + gap;
  }

  return { items: positionedItems, height: Math.max(0, ...laneHeights) - (items.length ? gap : 0) };
}

/**
 * Keeps item order deterministic while placing each next item into the current
 * shortest lane. Cards must provide a deterministic height for their lane width.
 */
export function ShortestLaneFeed<T>({ items, getItemKey, getItemHeight, renderItem, minLaneWidth = 220, maxLanes = 5, gap = 18, priorityCount = 4, className }: ShortestLaneFeedProps<T>) {
  const { containerRef, containerWidth } = useContainerWidth();
  const layout = useMemo(() => layoutItems(items, containerWidth, getItemHeight, minLaneWidth, maxLanes, gap), [containerWidth, gap, getItemHeight, items, maxLanes, minLaneWidth]);

  return <div ref={containerRef} className={className ?? "relative w-full"} style={{ height: layout.height }} aria-busy={containerWidth <= 0}>{layout.items.map(({ item, left, top, width }, index) => <div key={getItemKey(item)} className="absolute" style={{ left, top, width }}>{renderItem(item, index < priorityCount)}</div>)}</div>;
}
