"use client";

import { Clipboard, Download, X } from "lucide-react";
import { useRef, useState } from "react";
import type { ReactNode } from "react";

import type { GenerationAsset } from "@/entities/generation/model/generation";

type ImageDetailShellProps = {
  image: GenerationAsset;
  onClose: () => void;
  actions?: ReactNode;
  author?: ReactNode;
  allowCopy?: boolean;
};

function createdAtText(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

export function ImageDetailShell({ image, onClose, actions, author, allowCopy = false }: ImageDetailShellProps) {
  const failedUrls = useRef(new Set<string>());
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  function download(): void {
    const link = document.createElement("a");
    link.href = image.url;
    link.download = `aivista-${image.id}.png`;
    link.referrerPolicy = "no-referrer";
    document.body.append(link);
    link.click();
    link.remove();
  }
  async function copy(): Promise<void> {
    try {
      const response = await fetch(image.url, { mode: "cors", referrerPolicy: "no-referrer" });
      if (!response.ok || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error();
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
      setCopyFailed(false);
    } catch { setCopyFailed(true); }
  }

  return <section className="grid min-h-screen grid-cols-[minmax(0,1fr)_380px] bg-muted/35">
    <div onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} className="flex min-w-0 items-center justify-center p-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {imageUnavailable ? <p className="rounded-xl bg-muted px-5 py-4 text-sm text-muted-foreground">作品图片已不可用。</p> : <img src={image.url} alt={image.title ?? "作品详情"} referrerPolicy="no-referrer" onError={() => { failedUrls.current.add(image.url); setImageUnavailable(true); }} className="max-h-[calc(100vh-5rem)] max-w-full rounded-2xl bg-muted object-contain shadow-xl" />}
    </div>
    <aside className="min-h-0 overflow-y-auto border-l border-border bg-card">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-5 py-4 backdrop-blur"><button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="关闭详情"><X className="size-5" /></button><div className="flex gap-1"><button type="button" onClick={download} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"><Download className="size-4" />下载</button>{allowCopy ? <button type="button" onClick={() => void copy()} className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="复制图片"><Clipboard className="size-4" /></button> : null}</div></div>
      <div className="space-y-6 p-5">{copyFailed ? <p role="status" className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">复制失败，请使用下载。</p> : null}{author}{actions}
        <section><h2 className="text-sm font-semibold">作品信息</h2><dl className="mt-3 space-y-3 text-sm"><div><dt className="text-xs text-muted-foreground">标题</dt><dd className="mt-1 break-words font-medium">{image.title ?? "未命名作品"}</dd></div><div><dt className="text-xs text-muted-foreground">描述</dt><dd className="mt-1 whitespace-pre-wrap break-words leading-6">{image.description ?? "—"}</dd></div><div><dt className="text-xs text-muted-foreground">生成时间</dt><dd className="mt-1 font-medium">{createdAtText(image.createdAt)}</dd></div></dl></section>
        <section className="border-t border-border pt-6"><h2 className="text-sm font-semibold">提示词</h2><p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-muted/60 p-3 text-sm leading-6">{image.finalPrompt}</p>{image.finalNegativePrompt ? <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-muted/60 p-3 text-sm leading-6 text-muted-foreground">{image.finalNegativePrompt}</p> : null}</section>
        <section className="border-t border-border pt-6"><h2 className="text-sm font-semibold">本次生成</h2><dl className="mt-3 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-xs text-muted-foreground">尺寸</dt><dd className="mt-1 font-medium">{image.width} × {image.height}</dd></div><div><dt className="text-xs text-muted-foreground">生成数量</dt><dd className="mt-1 font-medium">{image.requestedImageCount} 张</dd></div></dl></section>
      </div>
    </aside>
  </section>;
}
