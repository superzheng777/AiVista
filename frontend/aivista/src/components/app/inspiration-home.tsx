"use client";
/* eslint-disable @next/next/no-img-element */

import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { useState } from "react";

import { needsImageUrlRefresh, type GenerationAsset } from "@/entities/generation/model/generation";
import { getInspiration, inspirationQueryKeys, listInspirations } from "@/features/inspiration/api/inspiration-api";
import { PublicImageDetail } from "@/features/inspiration/ui/public-image-detail";

export function InspirationHome() {
  const [selected, setSelected] = useState<GenerationAsset | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const inspirations = useQuery({ queryKey: inspirationQueryKeys.all, queryFn: listInspirations });
  async function openImage(image: GenerationAsset): Promise<void> {
    if (!needsImageUrlRefresh(image.urlExpiresAt)) {
      setSelected(image);
      return;
    }
    setOpeningId(image.id);
    try {
      setOpenError(null);
      setSelected(await getInspiration(image.id));
    } catch {
      setOpenError("图片访问地址刷新失败，请稍后重试。");
    } finally {
      setOpeningId(null);
    }
  }
  if (selected) return <PublicImageDetail image={selected} onClose={() => setSelected(null)} />;
  return <main className="mx-auto max-w-[1720px] px-4 py-8 sm:px-6 lg:px-8"><header className="mb-7"><p className="text-sm font-medium text-sky-600">灵感探索</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">公开作品</h1><p className="mt-2 text-sm text-muted-foreground">发现创作，打开详情后可查看作者与互动。</p></header>{openError ? <p role="status" className="mb-4 text-sm text-destructive">{openError}</p> : null}{inspirations.isLoading ? <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="aspect-square animate-pulse rounded-2xl bg-muted" />)}</div> : null}{inspirations.isError ? <section role="alert" className="rounded-2xl border border-destructive/20 bg-card p-8 text-center"><p className="text-sm text-destructive">灵感列表加载失败。</p><button type="button" onClick={() => void inspirations.refetch()} className="mt-3 text-sm font-medium underline">重新加载</button></section> : null}{!inspirations.isLoading && !inspirations.isError && !inspirations.data?.length ? <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">暂时还没有公开作品。</p> : null}<div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">{inspirations.data?.map((image) => <button key={image.id} type="button" disabled={openingId === image.id} onClick={() => void openImage(image)} className="group overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60"><img src={image.url} alt={image.title ?? "公开作品"} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="aspect-square w-full bg-muted object-cover" /><div className="flex items-center justify-between p-3"><p className="truncate text-sm font-medium">{image.title ?? "未命名作品"}</p><span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Heart className="size-3.5" />{image.likeCount}</span></div></button>)}</div></main>;
}
