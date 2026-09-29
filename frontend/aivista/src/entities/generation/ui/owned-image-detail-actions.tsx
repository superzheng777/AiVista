import { Heart, Send, Trash2 } from "lucide-react";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import { cn } from "@/shared/lib/cn";

export function OwnedImageDetailActions({
  image,
  isFavoriteUpdating,
  isDeleting,
  onFavorite,
  onPublish,
  onDelete,
}: {
  image: GenerationAsset;
  isFavoriteUpdating: boolean;
  isDeleting: boolean;
  onFavorite: () => void;
  onPublish: () => void;
  onDelete: () => void;
}) {
  return (
    <section>
      <p className="text-xs font-medium tracking-wide text-muted-foreground">作品操作</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={image.favorited}
          onClick={onFavorite}
          disabled={isFavoriteUpdating}
          className={cn(
            "inline-flex h-10 items-center justify-center gap-2 rounded-[7px] border text-sm font-medium transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50",
            image.favorited
              ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-hover)]"
              : "border-[var(--border)] text-[var(--text-secondary)]",
          )}
        >
          <Heart className={cn("size-4", image.favorited && "fill-current")} />
          {image.favorited ? "已收藏" : "收藏"}
        </button>
        <button
          type="button"
          onClick={onPublish}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[7px] border border-[var(--border)] text-sm font-medium transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <Send className="size-4" />
          {image.publicationReviewStatus === "APPROVED" ? "查看发布" : "发布"}
        </button>
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={isDeleting}
        className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[7px] bg-destructive/10 text-sm font-medium text-destructive transition hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Trash2 className="size-4" />
        删除图片
      </button>
    </section>
  );
}
