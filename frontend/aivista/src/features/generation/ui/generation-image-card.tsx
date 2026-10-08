"use client";
/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import { Clipboard, Download, Ellipsis, Heart, ImageOff, Send, Trash2 } from "lucide-react";
import type { GenerationAsset } from "@/entities/generation/model/generation";
import type { SessionAsset } from "@/entities/generation/model/session";
import { cn } from "@/shared/lib/cn";
import { downloadOriginalGenerationImage } from "@/features/assets/lib/original-image-download";

export function GenerationImageCard({
  image,
  onOpen,
  onRefresh,
  onFavorite,
  onPublish,
  onDelete,
}: {
  image: SessionAsset;
  onOpen: () => void;
  onRefresh: () => Promise<GenerationAsset>;
  onFavorite: (asset: GenerationAsset) => void;
  onPublish: (asset: GenerationAsset) => void;
  onDelete: (asset: GenerationAsset) => void;
}) {
  const [metadata, setMetadata] = useState<GenerationAsset | null>(null);
  const [replacement, setReplacement] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const retryUsedRef = useRef(false);
  async function retryImage(): Promise<void> {
    if (retryUsedRef.current) return setImageUnavailable(true);
    retryUsedRef.current = true;
    try {
      const refreshed = await onRefresh();
      setReplacement(refreshed.imageUrls.display?.url ?? null);
    } catch {
      setImageUnavailable(true);
    }
  }
  async function download(): Promise<void> {
    try {
      await downloadOriginalGenerationImage(await onRefresh());
    } catch {
      setActionError("下载失败，请稍后重试。");
    }
  }
  async function copy(): Promise<void> {
    try {
      const current = await onRefresh();
      const fetchDisplay = async (asset: GenerationAsset) => {
        const url = asset.imageUrls.display?.url;
        if (!url) throw new Error("missing display");
        const response = await fetch(url, {
          mode: "cors",
          referrerPolicy: "no-referrer",
        });
        if (!response.ok) throw new Error("image fetch failed");
        return response.blob();
      };
      let blob: Blob;
      try {
        blob = await fetchDisplay(current);
      } catch {
        blob = await fetchDisplay(await onRefresh());
      }
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("clipboard unavailable");
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/webp"]: blob })]);
    } catch {
      setActionError("复制失败，请使用下载。");
    }
  }
  if (!image.url)
    return (
      <div
        role="status"
        className="flex aspect-square flex-col items-center justify-center gap-2 rounded-[6px] border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] px-4 text-center text-xs text-[var(--text-secondary)]"
      >
        <ImageOff className="size-5" />
        图片已从资产库删除
      </div>
    );
  return (
    <div className="group relative overflow-visible rounded-[6px] border border-[var(--border)] bg-[var(--surface-bg)]">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full overflow-hidden rounded-[5px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        {imageUnavailable ? (
          <span className="flex aspect-square items-center justify-center bg-[var(--surface-soft)] text-xs text-[var(--text-secondary)]">
            图片已从资产库删除
          </span>
        ) : (
          <>
            {/* Private short-lived signed URLs must not be sent through an image optimizer. */}
            <img
              src={replacement ?? image.url!}
              alt="本次生成的图片"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => void retryImage()}
              className="aspect-square w-full object-cover transition duration-200 group-hover:scale-[1.015]"
            />
          </>
        )}
      </button>
      <div className="absolute right-2 top-2 z-10 flex translate-y-1 items-center gap-1 rounded-[6px] border border-white/30 bg-[var(--primary)]/90 p-1 text-[var(--surface-bg)] opacity-0 shadow-lg transition duration-150 group-hover:translate-y-0 group-hover:opacity-100 focus-within:translate-y-0 focus-within:opacity-100">
        <button
          type="button"
          onClick={() => void download()}
          className="grid size-7 place-items-center rounded-[4px] hover:bg-white/15"
          aria-label="下载原图"
        >
          <Download className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => void copy()}
          className="grid size-7 place-items-center rounded-[4px] hover:bg-white/15"
          aria-label="复制展示图"
        >
          <Clipboard className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={async () => {
            if (menuOpen) return setMenuOpen(false);
            try {
              setMetadata(await onRefresh());
              setMenuOpen(true);
            } catch {
              setActionError("图片操作暂时不可用。");
            }
          }}
          className="grid size-7 place-items-center rounded-[4px] hover:bg-white/15"
          aria-expanded={menuOpen}
          aria-label="更多图片操作"
        >
          <Ellipsis className="size-4" />
        </button>
        {menuOpen && metadata ? (
          <div className="absolute right-0 top-[calc(100%+6px)] w-28 overflow-hidden rounded-[6px] border border-[var(--border)] bg-[var(--surface-bg)] py-1 text-[var(--primary)] shadow-xl">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onFavorite(metadata);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--surface-soft)]"
            >
              <Heart className={cn("size-3.5", metadata.favorited && "fill-[var(--accent)] text-[var(--accent)]")} />
              {metadata.favorited ? "取消收藏" : "收藏"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onPublish(metadata);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--surface-soft)]"
            >
              <Send className="size-3.5" />
              {metadata.publicationReviewStatus === "APPROVED" ? "查看发布" : "发布"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onDelete(metadata);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--accent-hover)] hover:bg-[var(--accent-soft)]"
            >
              <Trash2 className="size-3.5" />
              删除
            </button>
          </div>
        ) : null}
      </div>
      {actionError ? (
        <p
          role="status"
          className="absolute inset-x-1 bottom-1 rounded-[4px] bg-[var(--primary)]/85 px-2 py-1 text-center text-[10px] text-white"
        >
          {actionError}
        </p>
      ) : null}
    </div>
  );
}
