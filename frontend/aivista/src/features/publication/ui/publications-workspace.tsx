"use client";
/* eslint-disable @next/next/no-img-element */

import { Dialog } from "@base-ui/react/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, LoaderCircle, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import { ImageDetailShell } from "@/entities/generation/ui/image-detail-shell";
import { PublicImageDetail } from "@/features/inspiration/ui/public-image-detail";
import { useGenerationEventStream } from "@/features/generation/model/generation-event-stream-provider";
import { listMyPublications, publicationQueryKeys, removePublication } from "@/features/publication/api/publication-api";
import { cn } from "@/lib/utils";

function createdAtText(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

export function PublicationsWorkspace() {
  const queryClient = useQueryClient();
  const { publicationRefreshVersion } = useGenerationEventStream();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const failedUrls = useRef(new Set<string>());
  const publicationsQuery = useQuery({ queryKey: publicationQueryKeys.mine, queryFn: listMyPublications });
  const publications = publicationsQuery.data ?? [];
  const detailAsset = publications.find((asset) => asset.id === detailId) ?? null;

  useEffect(() => {
    if (publicationRefreshVersion > 0) void publicationsQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicationRefreshVersion]);

  const deleteMutation = useMutation({
    mutationFn: removePublication,
    onMutate: async (imageId) => {
      await queryClient.cancelQueries({ queryKey: publicationQueryKeys.mine });
      const previous = queryClient.getQueryData<GenerationAsset[]>(publicationQueryKeys.mine);
      queryClient.setQueryData<GenerationAsset[]>(publicationQueryKeys.mine, (current) => current?.filter((asset) => asset.id !== imageId));
      return { previous };
    },
    onSuccess: () => { setDeleteId(null); setDetailId(null); setNotice("已撤销发布"); },
    onError: (_error, _imageId, context) => { if (context?.previous) queryClient.setQueryData(publicationQueryKeys.mine, context.previous); setDeleteId(null); setNotice("操作失败，请重试"); },
  });

  if (detailAsset?.publicationReviewStatus === "APPROVED") return <PublicImageDetail image={detailAsset} onClose={() => setDetailId(null)} />;
  if (detailAsset) return <PublicationDetail asset={detailAsset} isDeleting={deleteMutation.isPending} onClose={() => setDetailId(null)} onDelete={() => setDeleteId(detailAsset.id)} deleteDialog={deleteId ? <DeletePublicationDialog isApproved={false} isDeleting={deleteMutation.isPending} onCancel={() => setDeleteId(null)} onConfirm={() => deleteMutation.mutate(deleteId)} /> : null} />;

  return <div className="flex min-h-0 min-w-0 flex-col"><header className="flex min-h-12 items-center justify-between gap-4 border-b border-border px-6 py-3"><div><h2 className="text-base font-semibold text-card-foreground">发布区</h2><p className="mt-0.5 text-xs text-muted-foreground">{publications.length ? `共 ${publications.length} 项` : "审核中的作品会显示在这里"}</p></div></header>
    {notice ? <div role="status" className="flex items-center justify-between border-b border-border px-6 py-2.5 text-xs text-muted-foreground"><span>{notice}</span><button type="button" onClick={() => setNotice(null)} className="rounded p-0.5 hover:bg-muted" aria-label="关闭提示"><X className="size-3.5" /></button></div> : null}
    {publicationsQuery.isLoading ? <div className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(200px,1fr))] content-start gap-4 overflow-y-auto p-6">{Array.from({ length: 6 }, (_, index) => <div key={index} className="aspect-square animate-pulse rounded-2xl bg-muted" />)}</div> : null}
    {publicationsQuery.isError ? <div role="alert" className="m-6 rounded-2xl border border-destructive/20 bg-card p-8 text-center"><p className="text-sm text-destructive">发布区加载失败，请重试。</p><button type="button" onClick={() => void publicationsQuery.refetch()} className="mt-3 text-sm font-medium underline">重新加载</button></div> : null}
    {!publicationsQuery.isLoading && !publicationsQuery.isError && !publications.length ? <div className="flex flex-1 items-center justify-center p-10"><div className="text-center"><FolderOpen className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">还没有发布记录。请在资产详情中提交作品审核。</p></div></div> : null}
    {publications.length ? <div className="min-w-0 flex-1 overflow-y-auto p-6"><div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">{publications.map((asset) => <button key={asset.id} type="button" onClick={() => setDetailId(asset.id)} className="group relative overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><img src={asset.url} alt="已发布的图片" referrerPolicy="no-referrer" onError={() => { if (!failedUrls.current.has(asset.url)) { failedUrls.current.add(asset.url); void publicationsQuery.refetch(); } }} className="aspect-square w-full bg-muted object-cover" /><span className={cn("absolute left-3 top-3 rounded-full px-2 py-0.5 text-xs font-medium", asset.publicationReviewStatus === "APPROVED" ? "bg-emerald-500/90 text-white" : "bg-sky-500/90 text-white")}>{asset.publicationReviewStatus === "APPROVED" ? "已发布" : "审核中"}</span></button>)}</div></div> : null}
  </div>;
}

function PublicationDetail({ asset, onClose, onDelete, isDeleting, deleteDialog }: { asset: GenerationAsset; onClose: () => void; onDelete: () => void; isDeleting: boolean; deleteDialog: React.ReactNode }) {
  return <><ImageDetailShell image={asset} onClose={onClose} actions={<section><p className="text-xs font-medium tracking-wide text-muted-foreground">发布操作</p><div className="mt-3 rounded-xl bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">作品正在等待审核</div><button type="button" onClick={onDelete} disabled={isDeleting} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-destructive/10 text-sm font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"><Trash2 className="size-4" />取消审核</button><dl className="mt-5 space-y-3 border-t border-border pt-5 text-sm"><div><dt className="text-xs text-muted-foreground">提交时间</dt><dd className="mt-1 font-medium">{createdAtText(asset.createdAt)}</dd></div></dl></section>} />{deleteDialog}</>;
}

function DeletePublicationDialog({ isApproved, isDeleting, onCancel, onConfirm }: { isApproved: boolean; isDeleting: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <Dialog.Root open modal onOpenChange={(open) => { if (!open && !isDeleting) onCancel(); }}><Dialog.Portal><Dialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/35" /><Dialog.Viewport className="fixed inset-0 z-50 grid place-items-center p-4"><Dialog.Popup className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"><h2 className="text-lg font-semibold">{isApproved ? "撤销发布？" : "取消审核？"}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{isApproved ? "作品将从灵感页下架，但原图仍会保留在资产库。" : "作品将移出发布区，但原图仍会保留在资产库。"}</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onCancel} disabled={isDeleting} className="h-9 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted">取消</button><button type="button" onClick={onConfirm} disabled={isDeleting} className="inline-flex h-9 items-center gap-2 rounded-lg bg-destructive px-3 text-sm font-medium text-white disabled:opacity-60">{isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : null}确认</button></div></Dialog.Popup></Dialog.Viewport></Dialog.Portal></Dialog.Root>;
}
