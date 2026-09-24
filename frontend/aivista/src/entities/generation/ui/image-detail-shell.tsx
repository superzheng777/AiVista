"use client";
/* eslint-disable @next/next/no-img-element */

import { ArrowLeft, ChevronDown, ChevronUp, Clipboard, Download } from "lucide-react";
import { useRef, useState } from "react";
import type { ReactNode } from "react";

import { needsImageUrlRefresh, type GenerationAsset } from "@/entities/generation/model/generation";
import type { ImageDetailNavigation } from "@/entities/generation/model/use-image-detail-navigation";

type ImageDetailShellProps = {
  image: GenerationAsset;
  onClose: () => void;
  actions?: ReactNode;
  author?: ReactNode;
  allowCopy?: boolean;
  onDownload?: () => void | Promise<void>;
  downloadDisabled?: boolean;
  showTimeInInfo?: boolean;
  timeLabel?: string;
  timeValue?: string | null;
  refreshImage?: (imageId: string) => Promise<GenerationAsset>;
  navigation?: ImageDetailNavigation;
};

function createdAtText(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function ImageDetailShell(props: ImageDetailShellProps) {
  return <ImageDetailShellContent key={props.image.id} {...props} />;
}

function ImageDetailShellContent({
  image,
  onClose,
  actions,
  author,
  allowCopy = false,
  onDownload,
  downloadDisabled = false,
  showTimeInInfo = true,
  timeLabel = "生成时间",
  timeValue = image.createdAt,
  refreshImage,
  navigation,
}: ImageDetailShellProps) {
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const imageRetryUsedRef = useRef(false);
  const showAsideHeader = Boolean(onDownload) || allowCopy;

  async function refreshedImage(): Promise<GenerationAsset> {
    if (!refreshImage) throw new Error("Image refresh is unavailable");
    return refreshImage(image.id);
  }

  async function imageForAccess(): Promise<{ image: GenerationAsset; refreshed: boolean }> {
    if (!needsImageUrlRefresh(image.imageUrls.display)) return { image, refreshed: false };
    return { image: await refreshedImage(), refreshed: true };
  }

  async function fetchImage(imageToFetch: GenerationAsset): Promise<Blob> {
    const url = imageToFetch.imageUrls.display?.url;
    if (!url) throw new Error("Display image URL is unavailable");
    const response = await fetch(url, { mode: "cors", referrerPolicy: "no-referrer" });
    if (!response.ok) throw new Error("Image request failed");
    return response.blob();
  }

  async function download(): Promise<void> {
    if (!onDownload) return;
    setDownloadFailed(false);
    try {
      await onDownload();
    } catch {
      setDownloadFailed(true);
    }
  }
  async function copy(): Promise<void> {
    try {
      const access = await imageForAccess();
      let imageToCopy = access.image;
      const refreshed = access.refreshed;
      let blob: Blob;
      try {
        blob = await fetchImage(imageToCopy);
      } catch {
        if (refreshed) throw new Error("Image request failed after refresh");
        imageToCopy = await refreshedImage();
        blob = await fetchImage(imageToCopy);
      }
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/webp"]: blob })]);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  }
  async function retryImageAfterError(): Promise<void> {
    if (imageRetryUsedRef.current || !refreshImage) {
      setImageUnavailable(true);
      return;
    }
    imageRetryUsedRef.current = true;
    try {
      await refreshedImage();
    } catch {
      setImageUnavailable(true);
    }
  }

  return (
    <section className="grid h-dvh max-h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] overflow-hidden bg-muted/35 md:grid-cols-[minmax(0,1fr)_380px] md:grid-rows-1">
      <div
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
        className="relative flex min-h-0 min-w-0 items-center justify-center p-10"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute left-4 top-4 z-10 grid size-10 place-items-center rounded-[7px] border border-[var(--border)] bg-[var(--surface-bg)]/95 text-[var(--primary)] shadow-[0_8px_20px_var(--shadow)] backdrop-blur-sm transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          aria-label="返回上一级"
        >
          <ArrowLeft className="size-5" />
        </button>
        {navigation ? (
          <nav
            aria-label="作品浏览"
            aria-busy={navigation.pending}
            className="absolute right-4 top-1/2 z-10 flex -translate-y-1/2 flex-col overflow-hidden rounded-[7px] border border-white/20 bg-[var(--primary)]/85 text-[var(--surface-bg)] shadow-xl backdrop-blur-sm"
          >
            <button
              type="button"
              aria-label="上一张作品"
              disabled={!navigation.hasPrevious || navigation.pending}
              onClick={navigation.previous}
              className="grid size-11 place-items-center transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
            >
              <ChevronUp className="size-5" />
            </button>
            <span aria-hidden="true" className="h-px bg-white/15" />
            <button
              type="button"
              aria-label="下一张作品"
              disabled={!navigation.hasNext || navigation.pending}
              onClick={navigation.next}
              className="grid size-11 place-items-center transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
            >
              <ChevronDown className="size-5" />
            </button>
          </nav>
        ) : null}
        {imageUnavailable || !image.imageUrls.display ? (
          <p className="rounded-xl bg-muted px-5 py-4 text-sm text-muted-foreground">作品图片已不可用。</p>
        ) : (
          <img
            src={image.imageUrls.display.url}
            alt={image.title ?? "作品详情"}
            referrerPolicy="no-referrer"
            onError={() => void retryImageAfterError()}
            className="max-h-full max-w-full rounded-2xl bg-muted object-contain shadow-xl md:max-h-[calc(100vh-5rem)]"
          />
        )}
      </div>
      <aside className="min-h-0 overflow-y-auto border-t border-border bg-card md:border-l md:border-t-0">
        {showAsideHeader ? (
          <div className="sticky top-0 z-10 flex items-center justify-end border-b border-border bg-card/95 px-5 py-4 backdrop-blur">
            <div className="flex gap-1">
              {onDownload ? (
                <button
                  type="button"
                  disabled={downloadDisabled}
                  onClick={() => void download()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-[7px] border border-[var(--border)] px-3 text-sm font-medium text-[var(--primary)] transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="size-4" />
                  下载
                </button>
              ) : null}
              {allowCopy ? (
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="grid size-9 place-items-center rounded-[7px] text-[var(--text-secondary)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  aria-label="复制图片"
                >
                  <Clipboard className="size-4" />
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="space-y-6 p-5">
          {downloadFailed ? (
            <p role="status" className="rounded-[7px] bg-destructive/10 px-3 py-2 text-xs text-destructive">
              下载失败，请稍后重试。
            </p>
          ) : null}
          {copyFailed ? (
            <p role="status" className="rounded-[7px] bg-destructive/10 px-3 py-2 text-xs text-destructive">
              复制失败，请使用下载。
            </p>
          ) : null}
          {author}
          {actions}
          <section>
            <h2 className="text-sm font-semibold">作品信息</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">标题</dt>
                <dd className="mt-1 break-words font-medium">{image.title ?? "未命名作品"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">描述</dt>
                <dd className="mt-1 whitespace-pre-wrap break-words leading-6">{image.description ?? "—"}</dd>
              </div>
              {showTimeInInfo ? (
                <div>
                  <dt className="text-xs text-muted-foreground">{timeLabel}</dt>
                  <dd className="mt-1 font-medium">{timeValue ? createdAtText(timeValue) : "—"}</dd>
                </div>
              ) : null}
            </dl>
          </section>
          <section className="border-t border-border pt-6">
            <h2 className="text-sm font-semibold">提示词</h2>
            <div className="mt-3 space-y-4">
              <div>
                <h3 className="text-xs font-medium text-muted-foreground">正向提示词</h3>
                <p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-muted/60 p-3 text-sm leading-6">
                  {image.finalPrompt}
                </p>
              </div>
              {image.finalNegativePrompt ? (
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground">负向提示词</h3>
                  <p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-muted/60 p-3 text-sm leading-6">
                    {image.finalNegativePrompt}
                  </p>
                </div>
              ) : null}
            </div>
          </section>
          <section className="border-t border-border pt-6">
            <h2 className="text-sm font-semibold">本次生成</h2>
            <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">尺寸</dt>
                <dd className="mt-1 font-medium">
                  {image.width} × {image.height}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">生成数量</dt>
                <dd className="mt-1 font-medium">{image.requestedImageCount} 张</dd>
              </div>
            </dl>
          </section>
        </div>
      </aside>
    </section>
  );
}
