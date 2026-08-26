import { Heart } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

export const WORK_PREVIEW_CARD_META_HEIGHT = 52;

type ImageDimensions = { width: number; height: number };

export function getWorkPreviewCardHeight(image: ImageDimensions, laneWidth: number) {
  if (image.width <= 0 || image.height <= 0) return laneWidth + WORK_PREVIEW_CARD_META_HEIGHT;
  return laneWidth * (image.height / image.width) + WORK_PREVIEW_CARD_META_HEIGHT;
}

export function workPreviewAspectRatio(image: ImageDimensions): CSSProperties["aspectRatio"] {
  return image.width > 0 && image.height > 0 ? `${image.width} / ${image.height}` : "1 / 1";
}

/** Shared visual surface only; each feature owns its link/button and business actions. */
export function WorkPreviewCardSurface({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("relative overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface-bg)] text-left shadow-[0_1px_2px_rgb(43_35_25_/_3%),0_6px_16px_rgb(43_35_25_/_3%)] transition duration-150 group-hover:-translate-y-0.5 group-hover:shadow-[0_2px_4px_rgb(43_35_25_/_4%),0_14px_28px_rgb(43_35_25_/_8%)]", className)}>{children}</div>;
}

export function WorkPreviewCardImage({ image, children, className }: { image: ImageDimensions; children: ReactNode; className?: string }) {
  return <div className={cn("relative overflow-hidden bg-[var(--surface-soft)]", className)} style={{ aspectRatio: workPreviewAspectRatio(image) }}>{children}</div>;
}

export function WorkPreviewCardInfoBar({ title, trailing }: { title: string; trailing?: ReactNode }) {
  return <div className="flex h-[52px] items-center justify-between gap-3 border-t border-[var(--border)] px-[13px]"><p className="min-w-0 truncate text-[15px] font-semibold text-[var(--primary)]">{title}</p>{trailing}</div>;
}

export function WorkPreviewCardLikes({ count }: { count: number }) {
  return <span className="inline-flex shrink-0 items-center gap-[5px] text-[13px] text-[var(--text-secondary)]"><Heart className="size-4" />{count}</span>;
}
