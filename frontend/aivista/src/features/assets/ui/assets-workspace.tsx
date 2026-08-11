"use client";
/* eslint-disable @next/next/no-img-element */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, FolderOpen, Heart, LoaderCircle, Send, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import { ImageDetailShell } from "@/entities/generation/ui/image-detail-shell";
import { assetQueryKeys, deleteGenerationAssets, listGenerationAssets, setGenerationImageFavorites } from "@/features/assets/api/asset-api";
import { useGenerationEventStream } from "@/features/generation/model/generation-event-stream-provider";
import { PublicationFormDialog } from "@/features/publication/ui/publication-form-dialog";
import { cn } from "@/lib/utils";

const EMPTY_ASSETS: GenerationAsset[] = [];

function groupAssetsByDate(assets: GenerationAsset[]) {
  const formatter = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric", weekday: "short" });
  const groups = new Map<string, GenerationAsset[]>();
  for (const asset of assets) groups.set(formatter.format(new Date(asset.createdAt)), [...(groups.get(formatter.format(new Date(asset.createdAt))) ?? []), asset]);
  return [...groups].map(([label, items]) => ({ label, items }));
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
  const assetsQuery = useQuery({ queryKey: assetQueryKeys.all, queryFn: listGenerationAssets });
  const assets = assetsQuery.data ?? EMPTY_ASSETS;
  const groups = useMemo(() => groupAssetsByDate(assets), [assets]);
  const selectedHasUnfavorited = assets.some((asset) => selectedIds.has(asset.id) && !asset.favorited);
  const earliestExpiry = useMemo(() => assets.reduce<number | null>((earliest, asset) => {
    const expiresAt = Date.parse(asset.urlExpiresAt);
    return Number.isNaN(expiresAt) || (earliest !== null && earliest <= expiresAt) ? earliest : expiresAt;
  }, null), [assets]);

  useEffect(() => {
    if (earliestExpiry === null) return;
    const timeout = window.setTimeout(() => void queryClient.invalidateQueries({ queryKey: assetQueryKeys.all }), Math.max(0, earliestExpiry - Date.now() - 30_000));
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
      queryClient.setQueryData<GenerationAsset[]>(assetQueryKeys.all, (current) => current?.filter((asset) => !imageIds.includes(asset.id)));
      return { previous };
    },
    onSuccess: (_result, imageIds) => { setSelectedIds((ids) => new Set([...ids].filter((id) => !imageIds.includes(id)))); setDetailAsset((asset) => asset && imageIds.includes(asset.id) ? null : asset); setNotice(`已删除 ${imageIds.length} 张图片`); },
    onError: (_error, _imageIds, context) => { queryClient.setQueryData(assetQueryKeys.all, context?.previous); setNotice("删除失败，请重试"); },
    onSettled: () => setDeleteIds(null),
  });
  const favoriteMutation = useMutation({
    mutationFn: ({ imageIds, favorite }: { imageIds: string[]; favorite: boolean }) => setGenerationImageFavorites(imageIds, favorite),
    onMutate: async ({ imageIds, favorite }) => {
      await queryClient.cancelQueries({ queryKey: assetQueryKeys.all });
      const previous = queryClient.getQueryData<GenerationAsset[]>(assetQueryKeys.all);
      queryClient.setQueryData<GenerationAsset[]>(assetQueryKeys.all, (current) => current?.map((asset) => imageIds.includes(asset.id) ? { ...asset, favorited: favorite } : asset));
      const previousDetail = detailAsset;
      setDetailAsset((asset) => asset && imageIds.includes(asset.id) ? { ...asset, favorited: favorite } : asset);
      return { previous, previousDetail };
    },
    onSuccess: (_result, { favorite }) => setNotice(favorite ? "已收藏图片" : "已取消收藏"),
    onError: (_error, _variables, context) => { queryClient.setQueryData(assetQueryKeys.all, context?.previous); setDetailAsset(context?.previousDetail ?? null); setNotice("收藏状态更新失败，请重试"); },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: assetQueryKeys.all }),
  });

  function toggleSelection(id: string): void { setSelectedIds((ids) => { const next = new Set(ids); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function requestPublication(asset: GenerationAsset): void {
    if (asset.publicationReviewStatus === "PENDING") return setNotice("该图片正在审核中，可在发布区查看。");
    if (asset.publicationReviewStatus === "APPROVED") return setNotice("该图片已发布，请先在发布区撤销发布。");
    setPublishAsset(asset);
  }

  if (detailAsset) return <AssetDetail asset={detailAsset} onPublish={() => requestPublication(detailAsset)} onClose={() => setDetailAsset(null)} onDelete={() => setDeleteIds([detailAsset.id])} isDeleting={deleteMutation.isPending} isFavorite={detailAsset.favorited} isFavoriteUpdating={favoriteMutation.isPending} onFavorite={() => favoriteMutation.mutate({ imageIds: [detailAsset.id], favorite: !detailAsset.favorited })} deleteDialog={deleteIds ? <DeleteDialog count={deleteIds.length} isDeleting={deleteMutation.isPending} onCancel={() => setDeleteIds(null)} onConfirm={() => deleteMutation.mutate(deleteIds)} /> : null} publishDialog={publishAsset ? <PublicationFormDialog asset={publishAsset} onSuccess={(result) => { setPublishAsset(null); setDetailAsset((asset) => asset?.id === result.imageId ? { ...asset, publicationReviewStatus: result.status } : asset); void queryClient.invalidateQueries({ queryKey: assetQueryKeys.all }); setNotice("已提交审核，可在发布区查看。"); }} onClose={() => setPublishAsset(null)} /> : null} />;

  return <section className="min-h-screen bg-muted/35 px-6 py-9 lg:px-10"><div className="mx-auto max-w-[1680px]">
    <header className="flex min-h-10 items-center justify-between gap-5"><div><p className="text-sm font-medium text-sky-600">个人资产</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">你的创作</h1></div>{isManaging ? <div className="flex items-center gap-2"><span className="text-sm text-muted-foreground">已选 {selectedIds.size} 张</span><button type="button" onClick={() => assets.filter((asset) => selectedIds.has(asset.id)).forEach(downloadAsset)} disabled={!selectedIds.size} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"><Download className="size-4" />下载</button><button type="button" onClick={() => favoriteMutation.mutate({ imageIds: assets.filter((asset) => selectedIds.has(asset.id)).map((asset) => asset.id), favorite: selectedHasUnfavorited })} disabled={!selectedIds.size || favoriteMutation.isPending} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"><Heart className="size-4" />{selectedHasUnfavorited ? "批量收藏" : "取消收藏"}</button><button type="button" onClick={() => setDeleteIds([...selectedIds])} disabled={!selectedIds.size} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-destructive/10 px-3 text-sm font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"><Trash2 className="size-4" />删除</button><button type="button" onClick={() => { setIsManaging(false); setSelectedIds(new Set()); }} className="h-9 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted">取消选择</button></div> : <button type="button" onClick={() => setIsManaging(true)} className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted">批量操作</button>}</header>
    {notice ? <div role="status" className="mt-5 flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground"><span>{notice}</span><button type="button" onClick={() => setNotice(null)} className="rounded p-1 hover:bg-muted" aria-label="关闭提示"><X className="size-4" /></button></div> : null}
    {assetsQuery.isLoading ? <AssetSkeleton /> : null}{assetsQuery.isError ? <section role="alert" className="mt-10 rounded-2xl border border-destructive/20 bg-card p-8 text-center"><p className="text-sm text-destructive">资产加载失败，请重试。</p><button type="button" onClick={() => void assetsQuery.refetch()} className="mt-3 text-sm font-medium underline">重新加载</button></section> : null}{!assetsQuery.isLoading && !assetsQuery.isError && !assets.length ? <EmptyAssets /> : null}
    <div className="mt-9 space-y-10">{groups.map((group) => <section key={group.label}><h2 className="mb-4 text-sm font-medium text-muted-foreground">{group.label}</h2><div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">{group.items.map((asset) => <AssetCard key={asset.id} asset={asset} isManaging={isManaging} isSelected={selectedIds.has(asset.id)} onSelect={() => toggleSelection(asset.id)} onOpen={() => setDetailAsset(asset)} onRefresh={() => void assetsQuery.refetch()} />)}</div></section>)}</div>
  </div>{deleteIds ? <DeleteDialog count={deleteIds.length} isDeleting={deleteMutation.isPending} onCancel={() => setDeleteIds(null)} onConfirm={() => deleteMutation.mutate(deleteIds)} /> : null}</section>;
}

function AssetCard({ asset, isManaging, isSelected, onSelect, onOpen, onRefresh }: { asset: GenerationAsset; isManaging: boolean; isSelected: boolean; onSelect: () => void; onOpen: () => void; onRefresh: () => void }) {
  const failedUrls = useRef(new Set<string>());
  return <article className={cn("group relative overflow-hidden rounded-2xl border bg-card shadow-sm transition", isSelected ? "border-sky-500 ring-2 ring-sky-500/25" : "border-border hover:-translate-y-0.5 hover:shadow-md")}><button type="button" onClick={isManaging ? onSelect : onOpen} className="block w-full text-left"><img src={asset.url} alt="已生成的图片" referrerPolicy="no-referrer" onError={() => { if (!failedUrls.current.has(asset.url)) { failedUrls.current.add(asset.url); onRefresh(); } }} className="aspect-square w-full bg-muted object-cover" /></button>{isManaging ? <button type="button" onClick={onSelect} aria-label={isSelected ? "取消选择图片" : "选择图片"} className={cn("absolute right-3 top-3 grid size-7 place-items-center rounded-full border shadow-sm", isSelected ? "border-sky-500 bg-sky-500 text-white" : "border-white/80 bg-white/90 text-transparent")}><Check className="size-4" /></button> : null}</article>;
}

export function AssetDetail({ asset, onPublish, onClose, onDelete, isDeleting, isFavorite, isFavoriteUpdating, onFavorite, deleteDialog, publishDialog }: { asset: GenerationAsset; onPublish: () => void; onClose: () => void; onDelete: () => void; isDeleting: boolean; isFavorite: boolean; isFavoriteUpdating: boolean; onFavorite: () => void; deleteDialog: React.ReactNode; publishDialog: React.ReactNode }) {
  return <><ImageDetailShell image={asset} onClose={onClose} allowCopy={asset.publicationReviewStatus === "NONE"} actions={<section><p className="text-xs font-medium tracking-wide text-muted-foreground">作品操作</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={onFavorite} disabled={isFavoriteUpdating} className={cn("inline-flex h-10 items-center justify-center gap-2 rounded-lg border text-sm font-medium hover:bg-muted disabled:opacity-50", isFavorite ? "border-rose-200 bg-rose-50 text-rose-600" : "border-border text-muted-foreground")}><Heart className={cn("size-4", isFavorite && "fill-current")} />{isFavorite ? "已收藏" : "收藏"}</button><button type="button" onClick={onPublish} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium hover:bg-muted"><Send className="size-4" />发布</button></div><button type="button" onClick={onDelete} disabled={isDeleting} className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-destructive/10 text-sm font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"><Trash2 className="size-4" />删除图片</button></section>} />{deleteDialog}{publishDialog}</>;
}

function AssetSkeleton() { return <div className="mt-9 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="aspect-square animate-pulse rounded-2xl bg-muted" />)}</div>; }
function EmptyAssets() { return <section className="mt-16 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center"><FolderOpen className="mx-auto size-7 text-muted-foreground" /><h2 className="mt-4 text-lg font-semibold">尚无生成图片</h2><p className="mt-2 text-sm text-muted-foreground">开始一次创作后，成功生成的图片会保存在这里。</p><a href="/generate" className="mt-5 inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">前往生成</a></section>; }
function DeleteDialog({ count, isDeleting, onCancel, onConfirm }: { count: number; isDeleting: boolean; onCancel: () => void; onConfirm: () => void }) { return <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4"><section className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"><h2 className="text-lg font-semibold">删除图片？</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">将永久删除 {count} 张图片，此操作无法撤销。</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onCancel} disabled={isDeleting} className="h-9 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted">取消</button><button type="button" onClick={onConfirm} disabled={isDeleting} className="inline-flex h-9 items-center gap-2 rounded-lg bg-destructive px-3 text-sm font-medium text-white disabled:opacity-60">{isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : null}删除</button></div></section></div>; }
