import { Menu } from "@base-ui/react/menu";
import { Clipboard, MoreHorizontal, Send, Star, Trash2 } from "lucide-react";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import { cn } from "@/shared/lib/cn";

export function OwnedImageDetailActions({
  image,
  isFavoriteUpdating,
  isDeleting,
  onFavorite,
  onPublish,
  onCopy,
  onDelete,
  appearance = "detail",
}: {
  image: GenerationAsset;
  isFavoriteUpdating: boolean;
  isDeleting: boolean;
  onFavorite: () => void;
  onPublish: () => void;
  onCopy: () => Promise<void>;
  onDelete: () => void;
  appearance?: "detail" | "card";
}) {
  const card = appearance === "card";
  const buttonClassName = cn(
    "grid size-9 place-items-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50",
    card
      ? "rounded-[6px] bg-[var(--primary)]/90 text-[var(--surface-bg)] hover:bg-[var(--primary)] lg:size-8 min-[1320px]:size-9"
      : "rounded-[7px] text-[var(--primary)] hover:bg-[var(--surface-hover)]",
  );
  return (
    <>
      <button
        type="button"
        aria-label={image.favorited ? "已收藏" : "收藏"}
        aria-pressed={image.favorited}
        onClick={onFavorite}
        disabled={isFavoriteUpdating}
        className={cn(
          buttonClassName,
          image.favorited && (card ? "text-[var(--active-bg)]" : "text-[var(--accent-hover)]"),
        )}
      >
        <Star className={cn(card ? "size-4" : "size-5", image.favorited && "fill-current")} />
      </button>
      <Menu.Root>
        <Menu.Trigger aria-label="更多操作" className={buttonClassName}>
          <MoreHorizontal className="size-5" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={6} align="end" className="z-[80] outline-none">
            <Menu.Popup className="min-w-36 overflow-hidden rounded-[7px] border border-[var(--border)] bg-[var(--surface-bg)] p-1 text-sm text-[var(--primary)] shadow-[0_12px_26px_var(--shadow)] outline-none">
              <Menu.Item
                onClick={onPublish}
                className="flex cursor-default items-center gap-2 rounded-[5px] px-3 py-2 outline-none data-[highlighted]:bg-[var(--surface-hover)]"
              >
                <Send className="size-4" />
                {image.publicationReviewStatus === "APPROVED" ? "查看发布" : "发布"}
              </Menu.Item>
              <Menu.Item
                onClick={() => void onCopy()}
                className="flex cursor-default items-center gap-2 rounded-[5px] px-3 py-2 outline-none data-[highlighted]:bg-[var(--surface-hover)]"
              >
                <Clipboard className="size-4" />
                复制
              </Menu.Item>
              <Menu.Separator className="my-1 h-px bg-[var(--border)]" />
              <Menu.Item
                onClick={onDelete}
                disabled={isDeleting}
                className="flex cursor-default items-center gap-2 rounded-[5px] px-3 py-2 text-destructive outline-none data-[highlighted]:bg-destructive/10 data-[disabled]:opacity-50"
              >
                <Trash2 className="size-4" />
                删除
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </>
  );
}
