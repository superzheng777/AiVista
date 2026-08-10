"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@base-ui/react/dialog";
import { FolderOpen, LoaderCircle, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import { useGenerationEventStream } from "@/features/generation/model/generation-event-stream-provider";
import { listMyPublications, publicationQueryKeys, removePublication } from "@/features/publication/api/publication-api";
import { cn } from "@/lib/utils";

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

export function PublicationsWorkspace() {
  const queryClient = useQueryClient();
  const { publicationRefreshVersion } = useGenerationEventStream();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const publicationsQuery = useQuery({
    queryKey: publicationQueryKeys.mine,
    queryFn: listMyPublications,
  });
  const publications = publicationsQuery.data ?? [];
  const detailAsset = publications.find((asset) => asset.id === detailId) ?? null;
  // 当前详情被终态（审核未通过或服务失败）移出发布区时，保留审核结果提示而非直接关闭。
  const isDetailMissing = detailId !== null && !detailAsset && !publicationsQuery.isLoading;

  // 收到发布终态 SSE（或重连同步完成）后，后台重拉完整列表并合并；keyed 重渲染不重置列表与滚动。
  useEffect(() => {
    if (publicationRefreshVersion === 0) return;
    void publicationsQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicationRefreshVersion]);

  const deleteMutation = useMutation({
    mutationFn: removePublication,
    onMutate: async (imageId) => {
      await queryClient.cancelQueries({ queryKey: publicationQueryKeys.mine });
      const previous = queryClient.getQueryData<GenerationAsset[]>(publicationQueryKeys.mine);
      queryClient.setQueryData<GenerationAsset[]>(publicationQueryKeys.mine,
        (current) => current?.filter((asset) => asset.id !== imageId));
      return { previous };
    },
    onSuccess: () => {
      setDeleteIds(null);
      setDetailId(null);
      setNotice("已删除发布");
    },
    onError: (_error, _imageId, context) => {
      if (context?.previous) queryClient.setQueryData(publicationQueryKeys.mine, context.previous);
      setDeleteIds(null);
      setNotice("删除失败，请重试");
    },
  });

  function confirmDelete(imageIds: string[]): void {
    for (const imageId of imageIds) deleteMutation.mutate(imageId);
  }

  const failedUrls = useRef(new Set<string>());

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <header className="flex min-h-12 items-center justify-between gap-4 border-b border-border px-6 py-3">
        <div>
          <h2 className="text-base font-semibold text-card-foreground">发布区</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{publications.length > 0 ? `共 ${publications.length} 项` : "审核中的作品会出现在这里"}</p>
        </div>
      </header>

      {notice ? <div role="status" className="flex items-center justify-between border-b border-border px-6 py-2.5 text-xs text-muted-foreground"><span>{notice}</span><button type="button" onClick={() => setNotice(null)} className="rounded p-0.5 hover:bg-muted" aria-label="关闭提示"><X className="size-3.5" /></button></div> : null}

      {publicationsQuery.isLoading ? <div className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(200px,1fr))] content-start gap-4 overflow-y-auto p-6">{Array.from({ length: 6 }, (_, index) => <div key={index} className="aspect-square animate-pulse rounded-2xl bg-muted" />)}</div> : null}
      {publicationsQuery.isError ? <div role="alert" className="m-6 rounded-2xl border border-destructive/20 bg-card p-8 text-center"><p className="text-sm text-destructive">发布区加载失败，请重试。</p><button type="button" onClick={() => void publicationsQuery.refetch()} className="mt-3 text-sm font-medium underline underline-offset-4">重新加载</button></div> : null}
      {!publicationsQuery.isLoading && !publicationsQuery.isError && !publications.length ? <div className="flex flex-1 items-center justify-center p-10"><div className="text-center"><FolderOpen className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">还没有发布记录。回到资产页，在图片详情中选择“发布”提交审核。</p></div></div> : null}

      <div className="flex min-h-0 flex-1">
        {publications.length > 0 ? (
          <div className="min-w-0 flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
              {publications.map((asset) => (
                <button key={asset.id} type="button" onClick={() => setDetailId(asset.id)} className="group relative overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset.url} alt="已发布的图片" referrerPolicy="no-referrer" onError={() => { if (!failedUrls.current.has(asset.url)) { failedUrls.current.add(asset.url); void publicationsQuery.refetch(); } }} className="aspect-square w-full bg-muted object-cover" />
                  <span className={cn("absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", asset.publicationReviewStatus === "APPROVED" ? "bg-emerald-500/90 text-white" : "bg-sky-500/90 text-white")}>{asset.publicationReviewStatus === "APPROVED" ? "已发布" : "审核中"}</span>
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-3 pb-2 pt-8 text-xs text-white opacity-0 transition group-hover:opacity-100">{createdAtText(asset.publicAt ?? asset.createdAt)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {isDetailMissing ? (
          <aside className="w-80 shrink-0 border-l border-border bg-card">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-5 py-4 backdrop-blur"><div><p className="text-sm font-medium text-sky-600">发布详情</p><h3 className="mt-0.5 text-lg font-semibold text-card-foreground">审核结果</h3></div><button type="button" onClick={() => setDetailId(null)} className="grid size-9 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="关闭发布详情"><X className="size-5" /></button></div>
            <div className="space-y-6 p-5">
              <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">该作品未通过审核或审核服务暂不可用，已从发布区移除。审核结果与安全提示可在官方消息中查看，回到资产页修改文案后可重新提交。</div>
              <a href="/assets" className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground transition hover:bg-primary/80">前往资产页重新提交</a>
            </div>
          </aside>
        ) : null}

        {detailAsset ? (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-border bg-card">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-5 py-4 backdrop-blur"><div><p className="text-sm font-medium text-sky-600">发布详情</p><h3 className="mt-0.5 text-lg font-semibold text-card-foreground">{detailAsset.title ?? "未命名作品"}</h3></div><button type="button" onClick={() => setDetailId(null)} className="grid size-9 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="关闭发布详情"><X className="size-5" /></button></div>
            <div className="space-y-6 p-5">
              <div className="overflow-hidden rounded-xl border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={detailAsset.url} alt={detailAsset.title ?? "已发布的图片"} referrerPolicy="no-referrer" className="aspect-square w-full bg-muted object-cover" />
              </div>
              <div className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2.5 text-sm"><span className="text-muted-foreground">状态</span><span className={cn("font-medium", detailAsset.publicationReviewStatus === "APPROVED" ? "text-emerald-600" : "text-sky-600")}>{detailAsset.publicationReviewStatus === "APPROVED" ? "已发布" : "审核中"}</span></div>
              <div className="space-y-4 text-sm">
                <div><dt className="text-xs text-muted-foreground">提交审核时间</dt><dd className="mt-1 font-medium text-card-foreground">{createdAtText(detailAsset.createdAt)}</dd></div>
                {detailAsset.publicAt ? <div><dt className="text-xs text-muted-foreground">发布时间</dt><dd className="mt-1 font-medium text-card-foreground">{createdAtText(detailAsset.publicAt)}</dd></div> : null}
                <div><dt className="text-xs text-muted-foreground">作品标题</dt><dd className="mt-1 break-words font-medium text-card-foreground">{detailAsset.title}</dd></div>
                <div><dt className="text-xs text-muted-foreground">作品描述</dt><dd className="mt-1 whitespace-pre-wrap break-words leading-6 text-card-foreground">{detailAsset.description}</dd></div>
              </div>
              <div className="rounded-xl bg-sky-50 px-3 py-2.5 text-xs leading-5 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200">{detailAsset.publicationReviewStatus === "APPROVED" ? "作品已通过审核并在灵感页展示。删除发布后图片仍保留在资产库。" : "作品正在等待审核。删除发布将取消本次审核，图片仍保留在资产库。"}</div>
              <button type="button" onClick={() => setDeleteIds([detailAsset.id])} disabled={deleteMutation.isPending} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-destructive/10 text-sm font-medium text-destructive transition hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="size-4" />删除发布</button>
            </div>
          </aside>
        ) : null}
      </div>

      {deleteIds ? (
        <Dialog.Root open modal onOpenChange={(open) => { if (!open && !deleteMutation.isPending) setDeleteIds(null); }}>
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/35" />
            <Dialog.Viewport className="fixed inset-0 z-50 grid place-items-center p-4">
              <Dialog.Popup aria-labelledby="delete-publication-title" className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h2 id="delete-publication-title" className="text-lg font-semibold">{deleteIds.length === 1 && detailAsset?.publicationReviewStatus === "APPROVED" ? "撤销发布？" : "取消审核？"}</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{detailAsset?.publicationReviewStatus === "APPROVED" ? "撤销后图片将从灵感页下架，但原图仍保留在资产库。" : "取消审核后图片将移出发布区，但原图仍保留在资产库。"}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteIds(null)} disabled={deleteMutation.isPending} className="h-9 rounded-lg px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted">取消</button>
              <button type="button" onClick={() => confirmDelete(deleteIds)} disabled={deleteMutation.isPending} className="inline-flex h-9 items-center gap-2 rounded-lg bg-destructive px-3 text-sm font-medium text-white transition hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-60">{deleteMutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : null}确认删除</button>
            </div>
              </Dialog.Popup>
            </Dialog.Viewport>
          </Dialog.Portal>
        </Dialog.Root>
      ) : null}
    </div>
  );
}
