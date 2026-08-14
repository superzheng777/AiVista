"use client";

import { Clipboard, Download, X } from "lucide-react";
import { useRef, useState } from "react";
import type { ReactNode } from "react";

import { needsImageUrlRefresh, type GenerationAsset } from "@/entities/generation/model/generation";

type ImageDetailShellProps = {
  image: GenerationAsset;
  onClose: () => void;
  actions?: ReactNode;
  author?: ReactNode;
  allowCopy?: boolean;
  timeLabel?: string;
  timeValue?: string | null;
  refreshImage?: (imageId: string) => Promise<GenerationAsset>;
};

function createdAtText(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

export function ImageDetailShell({ image, onClose, actions, author, allowCopy = false, timeLabel = "生成时间", timeValue = image.createdAt, refreshImage }: ImageDetailShellProps) {
  const [currentImage, setCurrentImage] = useState(image);
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const imageRetryUsedRef = useRef(false);

  async function refreshedImage(): Promise<GenerationAsset> {
    if (!refreshImage) throw new Error("Image refresh is unavailable");
    const refreshed = await refreshImage(currentImage.id);
    setCurrentImage(refreshed);
    return refreshed;
  }

  async function imageForAccess(): Promise<{ image: GenerationAsset; refreshed: boolean }> {
    if (!needsImageUrlRefresh(currentImage.urlExpiresAt)) return { image: currentImage, refreshed: false };
    return { image: await refreshedImage(), refreshed: true };
  }

  async function fetchImage(imageToFetch: GenerationAsset): Promise<Blob> {
    const response = await fetch(imageToFetch.url, { mode: "cors", referrerPolicy: "no-referrer" });
    if (!response.ok) throw new Error("Image request failed");
    return response.blob();
  }

  async function download(): Promise<void> {
    setDownloadFailed(false);
    try {
      let { image: imageToDownload, refreshed } = await imageForAccess();
      let blob: Blob;
      try {
        blob = await fetchImage(imageToDownload);
      } catch {
        if (refreshed) throw new Error("Image request failed after refresh");
        imageToDownload = await refreshedImage();
        refreshed = true;
        blob = await fetchImage(imageToDownload);
      }
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `aivista-${imageToDownload.id}.png`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
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
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
      setCopyFailed(false);
    } catch { setCopyFailed(true); }
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

  return <section className="grid min-h-screen grid-cols-[minmax(0,1fr)_380px] bg-muted/35">
    <div onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} className="flex min-w-0 items-center justify-center p-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {imageUnavailable ? <p className="rounded-xl bg-muted px-5 py-4 text-sm text-muted-foreground">作品图片已不可用。</p> : <img src={currentImage.url} alt={currentImage.title ?? "作品详情"} referrerPolicy="no-referrer" onError={() => void retryImageAfterError()} className="max-h-[calc(100vh-5rem)] max-w-full rounded-2xl bg-muted object-contain shadow-xl" />}
    </div>
    <aside className="min-h-0 overflow-y-auto border-l border-border bg-card">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-5 py-4 backdrop-blur"><button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="关闭详情"><X className="size-5" /></button><div className="flex gap-1"><button type="button" onClick={() => void download()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"><Download className="size-4" />下载</button>{allowCopy ? <button type="button" onClick={() => void copy()} className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="复制图片"><Clipboard className="size-4" /></button> : null}</div></div>
      <div className="space-y-6 p-5">{downloadFailed ? <p role="status" className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">下载失败，请稍后重试。</p> : null}{copyFailed ? <p role="status" className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">复制失败，请使用下载。</p> : null}{author}{actions}
        <section><h2 className="text-sm font-semibold">作品信息</h2><dl className="mt-3 space-y-3 text-sm"><div><dt className="text-xs text-muted-foreground">标题</dt><dd className="mt-1 break-words font-medium">{currentImage.title ?? "未命名作品"}</dd></div><div><dt className="text-xs text-muted-foreground">描述</dt><dd className="mt-1 whitespace-pre-wrap break-words leading-6">{currentImage.description ?? "—"}</dd></div><div><dt className="text-xs text-muted-foreground">{timeLabel}</dt><dd className="mt-1 font-medium">{timeValue ? createdAtText(timeValue) : "—"}</dd></div></dl></section>
        <section className="border-t border-border pt-6"><h2 className="text-sm font-semibold">提示词</h2><p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-muted/60 p-3 text-sm leading-6">{currentImage.finalPrompt}</p>{currentImage.finalNegativePrompt ? <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-muted/60 p-3 text-sm leading-6 text-muted-foreground">{currentImage.finalNegativePrompt}</p> : null}</section>
        <section className="border-t border-border pt-6"><h2 className="text-sm font-semibold">本次生成</h2><dl className="mt-3 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-xs text-muted-foreground">尺寸</dt><dd className="mt-1 font-medium">{currentImage.width} × {currentImage.height}</dd></div><div><dt className="text-xs text-muted-foreground">生成数量</dt><dd className="mt-1 font-medium">{currentImage.requestedImageCount} 张</dd></div></dl></section>
      </div>
    </aside>
  </section>;
}
