"use client";

import { type GenerationAsset } from "@/entities/image-resource/model/image-resource";
import { OwnedImageDetailActions } from "@/entities/image-resource/ui/owned-image-detail-actions";
import { ResourceThumbnail } from "@/features/image-access/ui/resource-thumbnail";
import { cn } from "@/shared/lib/cn";
import { Check, Download } from "lucide-react";

function titleOf(asset: GenerationAsset) {
  return asset.title?.trim() || "未命名作品";
}

function statusOf(asset: GenerationAsset) {
  return asset.publicationReviewStatus === "APPROVED"
    ? "已发布"
    : asset.publicationReviewStatus === "PENDING"
      ? "审核中"
      : asset.publicationReviewStatus === "REJECTED"
        ? "未通过"
        : null;
}

export function AssetCard({
  asset,
  managing,
  selected,
  opening,
  favoriteUpdating,
  isDeleting,
  onOpen,
  onSelect,
  onBeginManaging,
  onFavorite,
  onDownload,
  onCopy,
  onPublish,
  onDelete,
}: {
  asset: GenerationAsset;
  managing: boolean;
  selected: boolean;
  opening: boolean;
  favoriteUpdating: boolean;
  isDeleting: boolean;
  onOpen: () => void;
  onSelect: () => void;
  onBeginManaging: () => void;
  onFavorite: () => void;
  onDownload: () => void;
  onCopy: () => Promise<void>;
  onPublish: () => void;
  onDelete: () => void;
}) {
  const status = statusOf(asset);
  return (
    <article className="min-w-0">
      <div
        className={cn(
          "group relative aspect-square overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface-bg)] transition duration-150 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgb(43_35_25_/_4%),0_12px_26px_rgb(43_35_25_/_8%)]",
          selected && "shadow-[inset_0_0_0_2px_var(--accent)]",
        )}
      >
        <button
          type="button"
          disabled={opening}
          onClick={managing ? onSelect : onOpen}
          className="block size-full text-left disabled:opacity-60"
        >
          {asset.imageUrls.thumbnail ? (
            <ResourceThumbnail
              image={asset}
              alt={titleOf(asset)}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="size-full object-cover"
            />
          ) : (
            <div className="grid size-full place-items-center bg-[var(--surface-soft)] text-xs text-[var(--text-secondary)]">
              图片不可用
            </div>
          )}
        </button>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[var(--primary)]/[0.28] opacity-0 transition-opacity group-hover:opacity-100"
        />
        {status ? (
          <span
            className={cn(
              "pointer-events-none absolute right-3 top-3 z-10 rounded-[5px] px-2 py-1 text-xs font-medium transition-opacity group-hover:opacity-0 group-focus-within:opacity-0 group-has-[[data-popup-open]]:opacity-0 lg:right-2 lg:top-2 min-[1320px]:right-3 min-[1320px]:top-3",
              asset.publicationReviewStatus === "APPROVED"
                ? "bg-[var(--active-bg)] text-[var(--accent)]"
                : "bg-[var(--surface-bg)] text-[var(--text-secondary)]",
            )}
          >
            {status}
          </span>
        ) : null}
        <button
          type="button"
          onClick={managing ? onSelect : onBeginManaging}
          className={cn(
            "absolute left-3 top-3 z-10 grid size-8 place-items-center rounded-[6px] border border-[var(--border)] bg-[var(--surface-bg)] text-[var(--primary)] transition lg:left-2 lg:top-2 min-[1320px]:left-3 min-[1320px]:top-3",
            managing ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100",
          )}
          aria-label={selected ? "取消选择图片" : "选择图片"}
        >
          <Check className={cn("size-4", selected ? "opacity-100" : "opacity-0")} />
        </button>
        <div className="absolute right-3 top-3 z-10 flex gap-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 has-[[data-popup-open]]:opacity-100 lg:right-2 lg:top-2 lg:gap-1 min-[1320px]:right-3 min-[1320px]:top-3 min-[1320px]:gap-2">
          <button
            type="button"
            title="下载"
            aria-label="下载图片"
            onClick={onDownload}
            className="grid size-9 place-items-center rounded-[6px] bg-[var(--primary)]/90 text-[var(--surface-bg)] transition hover:bg-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] lg:size-8 min-[1320px]:size-9"
          >
            <Download className="size-4" />
          </button>
          <OwnedImageDetailActions
            image={asset}
            appearance="card"
            isFavoriteUpdating={favoriteUpdating}
            isDeleting={isDeleting}
            onFavorite={onFavorite}
            onPublish={onPublish}
            onCopy={onCopy}
            onDelete={onDelete}
          />
        </div>
      </div>
    </article>
  );
}
