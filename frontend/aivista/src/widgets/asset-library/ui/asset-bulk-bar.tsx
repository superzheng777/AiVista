"use client";

import { Download, Star, Trash2 } from "lucide-react";

export function BulkBar({
  count,
  hasUnfavorited,
  favoriteUpdating,
  deleting,
  onCancel,
  onDownload,
  onFavorite,
  onDelete,
}: {
  count: number;
  hasUnfavorited: boolean;
  favoriteUpdating: boolean;
  deleting: boolean;
  onCancel: () => void;
  onDownload: () => void;
  onFavorite: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="fixed bottom-6 left-[calc(50%+44px)] z-30 flex h-16 w-[calc(100%-32px)] max-w-[760px] -translate-x-1/2 items-center gap-2 rounded-[10px] bg-[var(--primary)] px-4 text-[var(--surface-bg)] shadow-[0_12px_26px_rgb(43_35_25_/_20%)] sm:w-[calc(100%-120px)] sm:px-5">
      <span className="mr-auto text-sm">已选择 {count} 项</span>
      <button type="button" onClick={onCancel} className="h-10 rounded-[6px] px-3 text-sm hover:bg-white/10">
        取消选择
      </button>
      <button
        type="button"
        onClick={onDownload}
        disabled={!count}
        className="inline-flex h-10 items-center gap-1.5 rounded-[6px] bg-white/10 px-3 text-sm disabled:opacity-40"
      >
        <Download className="size-4" />
        下载
      </button>
      <button
        type="button"
        onClick={onFavorite}
        disabled={!count || favoriteUpdating}
        className="inline-flex h-10 items-center gap-1.5 rounded-[6px] bg-white/10 px-3 text-sm disabled:opacity-40"
      >
        <Star className="size-4" />
        {hasUnfavorited ? "收藏" : "取消收藏"}
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={!count || deleting}
        className="inline-flex h-10 items-center gap-1.5 rounded-[6px] bg-[var(--accent)] px-3 text-sm disabled:opacity-40"
      >
        <Trash2 className="size-4" />
        删除
      </button>
    </div>
  );
}
