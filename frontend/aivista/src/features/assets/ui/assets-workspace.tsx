"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clipboard, Download, FolderOpen, Heart, LoaderCircle, Send, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import { assetQueryKeys, deleteGenerationAssets, listGenerationAssets, setGenerationImageFavorites } from "@/features/assets/api/asset-api";
import { useGenerationEventStream } from "@/features/generation/model/generation-event-stream-provider";
import { PublicationFormDialog } from "@/features/publication/ui/publication-form-dialog";
import { cn } from "@/lib/utils";

const EMPTY_ASSETS: GenerationAsset[] = [];

function groupAssetsByDate(assets: GenerationAsset[]): Array<{ label: string; items: GenerationAsset[] }> {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
  const groups = new Map<string, GenerationAsset[]>();
  for (const asset of assets) {
    const label = formatter.format(new Date(asset.createdAt));
    groups.set(label, [...(groups.get(label) ?? []), asset]);
  }
  return [...groups].map(([label, items]) => ({ label, items }));
}

function ratioOf(asset: GenerationAsset): string {
  const divisor = (left: number, right: number): number => right ? divisor(right, left % right) : left;
  const gcd = divisor(asset.width, asset.height);
  return `${asset.width / gcd}:${asset.height / gcd}`;
}

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

function downloadAsset(asset: GenerationAsset): void {
  const link = document.createElement("a");
  link.href = asset.url;
  link.download = `aivista-${asset.id}.png`;
  link.referrerPolicy = "no-referrer";
  document.body.append(link);
  link.click();
  link.remove();
}

export function AssetsWorkspace() {
  const queryClient = useQueryClient();
  const { hasCompletedResults, acknowledgeCompletedResults } = useGenerationEventStream();
  const lastAcknowledgedAssetUpdateRef = useRef(0);
  const [isManaging, setIsManaging] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailAsset, setDetailAsset] = useState<GenerationAsset | null>(null);
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [publishAsset, setPublishAsset] = useState<GenerationAsset | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const assetsQuery = {
    ...useQuery({ queryKey: assetQueryKeys.all, queryFn: listGenerationAssets }),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: async () => undefined,
  };
  const assets = assetsQuery.data ?? EMPTY_ASSETS;
  const selectedHasUnfavorited = assets.some((asset) => selectedIds.has(asset.id) && !asset.favorited);
  const groups = useMemo(() => groupAssetsByDate(assets), [assets]);
  const earliestExpiry = useMemo(() => assets.reduce<number | null>((earliest, asset) => {
    const expiresAt = Date.parse(asset.urlExpiresAt);
    return Number.isNaN(expiresAt) || (earliest !== null && earliest <= expiresAt) ? earliest : expiresAt;
  }, null), [assets]);

  useEffect(() => {
    if (earliestExpiry === null) return;
    const timeout = window.setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: assetQueryKeys.all });
    }, Math.max(0, earliestExpiry - Date.now() - 30_000));
    return () => window.clearTimeout(timeout);
  }, [earliestExpiry, queryClient]);

  useEffect(() => {
    if (!assetsQuery.dataUpdatedAt || assetsQuery.dataUpdatedAt <= lastAcknowledgedAssetUpdateRef.current) return;
    lastAcknowledgedAssetUpdateRef.current = assetsQuery.dataUpdatedAt;
    if (hasCompletedResults) acknowledgeCompletedResults();
  }, [acknowledgeCompletedResults, assetsQuery.dataUpdatedAt, hasCompletedResults]);

  const deleteMutation = useMutation({
    mutationFn: deleteGenerationAssets,
    onMutate: async (imageIds) => {
      await queryClient.cancelQueries({ queryKey: assetQueryKeys.all });
      const previous = queryClient.getQueryData<GenerationAsset[]>(assetQueryKeys.all);
      queryClient.setQueryData<GenerationAsset[]>(assetQueryKeys.all,
        (current) => current?.filter((asset) => !imageIds.includes(asset.id)));
      return { previous };
    },
    onSuccess: (_result, imageIds) => {
      setSelectedIds((current) => new Set([...current].filter((id) => !imageIds.includes(id))));
      setDetailAsset((current) => current && imageIds.includes(current.id) ? null : current);
      setNotice(`已删除 ${imageIds.length} 张图片`);
    },
    onError: (_error, _imageIds, context) => {
      queryClient.setQueryData(assetQueryKeys.all, context?.previous);
      setNotice("删除失败，请重试");
    },
    onSettled: () => {
      setDeleteIds(null);
    },
  });
  const favoriteMutation = useMutation({
    mutationFn: ({ imageIds, favorite }: { imageIds: string[]; favorite: boolean }) => setGenerationImageFavorites(imageIds, favorite),
    onMutate: async ({ imageIds, favorite }) => {
      await queryClient.cancelQueries({ queryKey: assetQueryKeys.all });
      const previous = queryClient.getQueryData<GenerationAsset[]>(assetQueryKeys.all);
      queryClient.setQueryData<GenerationAsset[]>(assetQueryKeys.all, (current) =>
        current?.map((asset) => imageIds.includes(asset.id) ? { ...asset, favorited: favorite } : asset));
      const previousDetail = detailAsset;
      setDetailAsset((current) => current && imageIds.includes(current.id) ? { ...current, favorited: favorite } : current);
      return { previous, previousDetail };
    },
    onSuccess: (_result, { imageIds, favorite }) => setNotice(favorite ? `已收藏 ${imageIds.length} 张图片` : `已取消收藏 ${imageIds.length} 张图片`),
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(assetQueryKeys.all, context?.previous);
      setDetailAsset(context?.previousDetail ?? null);
      setNotice("收藏状态更新失败，请重试");
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: assetQueryKeys.all }),
  });

  function toggleSelection(id: string): void {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function leaveManaging(): void {
    setIsManaging(false);
    setSelectedIds(new Set());
  }

  function downloadSelected(): void {
    const selectedAssets = assets.filter((asset) => selectedIds.has(asset.id));
    selectedAssets.forEach(downloadAsset);
    if (selectedAssets.length > 1) setNotice("已发起逐张下载；若浏览器拦截，请允许此网站下载多个文件后重试。");
  }

  function requestPublication(asset: GenerationAsset): void {
    if (asset.publicationReviewStatus === "PENDING") {
      setNotice("该图片正在审核中，可在个人中心的发布区查看。");
      return;
    }
    if (asset.publicationReviewStatus === "APPROVED") {
      setNotice("该图片已发布，请先在个人中心撤销发布。");
      return;
    }
    setPublishAsset(asset);
  }

  function setSelectedFavorites(favorite: boolean): void {
    const imageIds = assets.filter((asset) => selectedIds.has(asset.id)).map((asset) => asset.id);
    if (imageIds.length) favoriteMutation.mutate({ imageIds, favorite });
  }

  if (detailAsset) {
    const isFavorite = detailAsset.favorited;
    return <AssetDetail asset={detailAsset} onPublish={() => requestPublication(detailAsset)} onClose={() => setDetailAsset(null)}
      onDownload={() => downloadAsset(detailAsset)} onCopyResult={setNotice}
      onDelete={() => setDeleteIds([detailAsset.id])} onRefresh={() => void assetsQuery.refetch()} isDeleting={deleteMutation.isPending}
      isFavorite={isFavorite} isFavoriteUpdating={favoriteMutation.isPending}
      onFavorite={() => favoriteMutation.mutate({ imageIds: [detailAsset.id], favorite: !isFavorite })}
      deleteDialog={deleteIds ? <DeleteDialog count={deleteIds.length} isDeleting={deleteMutation.isPending} onCancel={() => setDeleteIds(null)} onConfirm={() => deleteMutation.mutate(deleteIds)} /> : null} notice={notice}
      publishDialog={publishAsset ? <PublicationFormDialog asset={publishAsset} onSuccess={(result) => { setPublishAsset(null); setDetailAsset((current) => current?.id === result.imageId ? { ...current, publicationReviewStatus: result.status } : current); queryClient.setQueryData<GenerationAsset[]>(assetQueryKeys.all, (current) => current?.map((asset) => asset.id === result.imageId ? { ...asset, publicationReviewStatus: result.status } : asset)); setNotice("已提交审核，可在个人中心的发布区查看。"); void queryClient.invalidateQueries({ queryKey: assetQueryKeys.all }); }} onClose={() => setPublishAsset(null)} /> : null} />;
  }

  return (
    <section className="min-h-screen bg-muted/35 px-6 py-9 lg:px-10">
      <div className="mx-auto max-w-[1680px]">
        <header className="flex min-h-10 items-center justify-between gap-5">
          <div><p className="text-sm font-medium text-sky-600">个人资产</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">你的创作</h1></div>
          {isManaging ? <div className="flex items-center gap-2"><span className="text-sm text-muted-foreground">已选 {selectedIds.size} 张</span><button type="button" onClick={downloadSelected} disabled={!selectedIds.size} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"><Download className="size-4" />下载</button><button type="button" onClick={() => setSelectedFavorites(selectedHasUnfavorited)} disabled={!selectedIds.size || favoriteMutation.isPending} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"><Heart className="size-4" />{selectedHasUnfavorited ? "批量收藏" : "取消收藏"}</button><button type="button" onClick={() => setDeleteIds([...selectedIds])} disabled={!selectedIds.size} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-destructive/10 px-3 text-sm font-medium text-destructive transition hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="size-4" />删除</button><button type="button" onClick={leaveManaging} className="h-9 rounded-lg px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">取消选择</button></div> : <button type="button" onClick={() => setIsManaging(true)} className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-sm font-medium transition hover:bg-muted">批量操作</button>}
        </header>

        {notice ? <div role="status" className="mt-5 flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground"><span>{notice}</span><button type="button" onClick={() => setNotice(null)} className="rounded p-1 hover:bg-muted" aria-label="关闭提示"><X className="size-4" /></button></div> : null}
        {assetsQuery.isLoading ? <AssetSkeleton /> : null}
        {assetsQuery.isError ? <section role="alert" className="mt-10 rounded-2xl border border-destructive/20 bg-card p-8 text-center"><p className="text-sm text-destructive">资产加载失败，请重试。</p><button type="button" onClick={() => void assetsQuery.refetch()} className="mt-3 text-sm font-medium underline underline-offset-4">重新加载</button></section> : null}
        {!assetsQuery.isLoading && !assetsQuery.isError && !assets.length ? <EmptyAssets /> : null}
        <div className="mt-9 space-y-10">{groups.map((group) => <section key={group.label}><h2 className="mb-4 text-sm font-medium text-muted-foreground">{group.label}</h2><div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">{group.items.map((asset) => <AssetCard key={asset.id} asset={asset} isManaging={isManaging} isSelected={selectedIds.has(asset.id)} onSelect={() => toggleSelection(asset.id)} onOpen={() => setDetailAsset(asset)} onRefresh={() => void assetsQuery.refetch()} />)}</div></section>)}</div>
        {assetsQuery.hasNextPage ? <div className="mt-10 flex justify-center"><button type="button" onClick={() => void assetsQuery.fetchNextPage()} disabled={assetsQuery.isFetchingNextPage} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60">{assetsQuery.isFetchingNextPage ? <LoaderCircle className="size-4 animate-spin" /> : null}加载更多</button></div> : null}
      </div>
      {deleteIds ? <DeleteDialog count={deleteIds.length} isDeleting={deleteMutation.isPending} onCancel={() => setDeleteIds(null)} onConfirm={() => deleteMutation.mutate(deleteIds)} /> : null}
    </section>
  );
}

function AssetCard({ asset, isManaging, isSelected, onSelect, onOpen, onRefresh }: { asset: GenerationAsset; isManaging: boolean; isSelected: boolean; onSelect: () => void; onOpen: () => void; onRefresh: () => void }) {
  const failedUrls = useRef(new Set<string>());
  return <article className={cn("group relative overflow-hidden rounded-2xl border bg-card shadow-sm transition", isSelected ? "border-sky-500 ring-2 ring-sky-500/25" : "border-border hover:-translate-y-0.5 hover:shadow-md")}>
    <button type="button" onClick={isManaging ? onSelect : onOpen} className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={isManaging ? `${isSelected ? "取消选择" : "选择"}图片` : "查看图片详情"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset.url} alt="已生成的图片" referrerPolicy="no-referrer" onError={() => { if (!failedUrls.current.has(asset.url)) { failedUrls.current.add(asset.url); onRefresh(); } }} className="aspect-square w-full bg-muted object-cover" />
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-3 pb-2 pt-8 text-xs text-white opacity-0 transition group-hover:opacity-100">{createdAtText(asset.createdAt)}</span>
    </button>
    {isManaging ? <button type="button" onClick={onSelect} aria-label={isSelected ? "取消选择" : "选择图片"} className={cn("absolute right-3 top-3 grid size-7 place-items-center rounded-full border shadow-sm transition", isSelected ? "border-sky-500 bg-sky-500 text-white" : "border-white/80 bg-white/90 text-transparent hover:border-sky-300")}><Check className="size-4" /></button> : null}
  </article>;
}

function AssetDetail({ asset, onPublish, onClose, onDownload, onCopyResult, onDelete, onRefresh, isDeleting, isFavorite, isFavoriteUpdating, onFavorite, deleteDialog, notice, publishDialog }: { asset: GenerationAsset; onPublish: () => void; onClose: () => void; onDownload: () => void; onCopyResult: (message: string) => void; onDelete: () => void; onRefresh: () => void; isDeleting: boolean; isFavorite: boolean; isFavoriteUpdating: boolean; onFavorite: () => void; deleteDialog: React.ReactNode; notice: string | null; publishDialog: React.ReactNode }) {
  const failedUrls = useRef(new Set<string>());
  async function copyImage(): Promise<void> {
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("Clipboard API unavailable");
      const response = await fetch(asset.url, { mode: "cors", referrerPolicy: "no-referrer" });
      if (!response.ok) throw new Error("Unable to fetch image");
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
      onCopyResult("图片已复制到剪贴板");
    } catch {
      onCopyResult("复制失败，请下载图片");
    }
  }

  return <section className="grid min-h-screen grid-cols-[minmax(0,1fr)_380px] bg-muted/35">
    <div onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} className="flex min-w-0 items-center justify-center p-10" aria-label="点击图片周边留白关闭详情">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset.url} alt="已生成的图片详情" referrerPolicy="no-referrer" onClick={(event) => event.stopPropagation()} onError={() => { if (!failedUrls.current.has(asset.url)) { failedUrls.current.add(asset.url); onRefresh(); } }} className="max-h-[calc(100vh-5rem)] max-w-full rounded-2xl bg-muted object-contain shadow-xl" />
    </div>
    <aside className="min-h-0 overflow-y-auto border-l border-border bg-card">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-5 py-4 backdrop-blur"><button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="关闭详情"><X className="size-5" /></button><div className="flex items-center gap-1"><button type="button" onClick={onDownload} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium transition hover:bg-muted"><Download className="size-4" />下载</button><button type="button" onClick={() => void copyImage()} className="grid size-9 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="复制图片"><Clipboard className="size-4" /></button></div></div>
      {notice ? <p role="status" className="border-b border-border px-5 py-3 text-xs text-muted-foreground">{notice}</p> : null}
      <div className="space-y-7 p-5">
        <section><p className="text-xs font-medium tracking-wide text-muted-foreground">作品操作</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={onFavorite} disabled={isFavoriteUpdating} className={cn("inline-flex h-10 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50", isFavorite ? "border-rose-200 bg-rose-50 text-rose-600" : "border-border text-muted-foreground hover:text-foreground")}><Heart className={cn("size-4", isFavorite && "fill-current")} />{isFavorite ? "已收藏" : "收藏"}</button><button type="button" onClick={onPublish} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium transition hover:bg-muted hover:text-foreground"><Send className="size-4" />发布</button></div><button type="button" onClick={onDelete} disabled={isDeleting} className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-destructive/10 text-sm font-medium text-destructive transition hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="size-4" />删除图片</button></section>
        <section className="border-t border-border pt-6"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">提示词</h2></div><p className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-muted/60 p-3 text-sm leading-6 text-foreground">{asset.finalPrompt}</p>{asset.finalNegativePrompt ? <><p className="mt-5 text-xs font-medium tracking-wide text-muted-foreground">负向提示词</p><p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-muted/60 p-3 text-sm leading-6 text-muted-foreground">{asset.finalNegativePrompt}</p></> : null}</section>
        <section className="border-t border-border pt-6"><h2 className="text-sm font-semibold">本次生成</h2><dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 text-sm"><Property label="比例" value={ratioOf(asset)} /><Property label="尺寸" value={`${asset.width} × ${asset.height}`} /><Property label="生成时间" value={createdAtText(asset.createdAt)} /><Property label="生成数量" value={`${asset.requestedImageCount} 张`} /></dl></section>
      </div>
    </aside>
    {deleteDialog}
    {publishDialog}
  </section>;
}

function Property({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-medium text-foreground">{value}</dd></div>; }
function AssetSkeleton() { return <div className="mt-9 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="aspect-square animate-pulse rounded-2xl bg-muted" />)}</div>; }
function EmptyAssets() { return <section className="mt-16 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center"><FolderOpen className="mx-auto size-7 text-muted-foreground" /><h2 className="mt-4 text-lg font-semibold">尚无生成图片</h2><p className="mt-2 text-sm text-muted-foreground">开始一次创作后，成功生成的图片会保存在这里。</p><a href="/generate" className="mt-5 inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/80">前往生成</a></section>; }
function DeleteDialog({ count, isDeleting, onCancel, onConfirm }: { count: number; isDeleting: boolean; onCancel: () => void; onConfirm: () => void }) { return <div role="dialog" aria-modal="true" aria-labelledby="delete-assets-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4"><section className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"><h2 id="delete-assets-title" className="text-lg font-semibold">删除图片？</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">将永久删除 {count} 张图片，此操作无法撤销。</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onCancel} disabled={isDeleting} className="h-9 rounded-lg px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted">取消</button><button type="button" onClick={onConfirm} disabled={isDeleting} className="inline-flex h-9 items-center gap-2 rounded-lg bg-destructive px-3 text-sm font-medium text-white transition hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-60">{isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : null}删除 {count} 张图片</button></div></section></div>; }
