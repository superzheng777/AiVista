"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Eye, FolderOpen, LoaderCircle, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import { AssetDetail } from "@/features/assets/ui/assets-workspace";
import { deleteGenerationAssets, setGenerationImageFavorites } from "@/features/assets/api/asset-api";
import { PublicImageDetail } from "@/features/inspiration/ui/public-image-detail";
import { PublicationFormDialog } from "@/features/publication/ui/publication-form-dialog";
import { useGenerationEventStream } from "@/features/generation/model/generation-event-stream-provider";
import {
  deleteOfficialNotification,
  fetchOfficialNotificationUnreadCount,
  listOfficialNotifications,
  markAllOfficialNotificationsRead,
  markOfficialNotificationRead,
  officialNotificationQueryKeys,
} from "@/features/official-notifications/api/official-notifications-api";
import { isPublicationFailed, isPublicationRejected, notificationEventLabel, violationText } from "@/features/official-notifications/model/notification-display";
import { cn } from "@/lib/utils";

function createdAtText(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

export function OfficialNotificationsBell() {
  const queryClient = useQueryClient();
  const { publicationRefreshVersion } = useGenerationEventStream();
  const [open, setOpen] = useState(false);
  const [detailImage, setDetailImage] = useState<GenerationAsset | null>(null);
  const unread = useQuery({ queryKey: officialNotificationQueryKeys.unreadCount, queryFn: fetchOfficialNotificationUnreadCount });
  const list = useInfiniteQuery({
    queryKey: officialNotificationQueryKeys.list,
    queryFn: ({ pageParam }) => listOfficialNotifications(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: open,
  });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: officialNotificationQueryKeys.list });
    void queryClient.invalidateQueries({ queryKey: officialNotificationQueryKeys.unreadCount });
  };
  const markRead = useMutation({ mutationFn: markOfficialNotificationRead, onSuccess: refresh });
  const markAllRead = useMutation({ mutationFn: markAllOfficialNotificationsRead, onSuccess: refresh });
  const remove = useMutation({ mutationFn: deleteOfficialNotification, onSuccess: refresh });

  useEffect(() => {
    if (publicationRefreshVersion > 0) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicationRefreshVersion]);

  const unreadCount = unread.data ?? 0;
  return <>
    <button type="button" onClick={() => { setDetailImage(null); setOpen(true); }} aria-label={`官方消息${unreadCount ? `（${unreadCount} 条未读）` : ""}`} className="relative grid size-10 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Bell className="size-5" />
      {unreadCount ? <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-white">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
    </button>
    <Dialog.Root open={open} modal onOpenChange={setOpen}>
      <Dialog.Portal><Dialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/20 backdrop-blur-[1px]" /><Dialog.Viewport className="fixed inset-0 z-50"><Dialog.Popup aria-labelledby="official-notifications-title" className="absolute inset-y-0 left-0 flex w-full max-w-md flex-col border-r border-border bg-card shadow-2xl md:left-24">
        {detailImage ? detailImage.publicationReviewStatus === "APPROVED" ? <PublicImageDetail image={detailImage} onClose={() => setDetailImage(null)} /> : <OfficialAssetDetail image={detailImage} onClose={() => setDetailImage(null)} /> : <>
          <header className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 id="official-notifications-title" className="text-lg font-semibold text-card-foreground">官方消息</h2><p className="mt-0.5 text-xs text-muted-foreground">{unreadCount ? `${unreadCount} 条未读` : "没有未读消息"}</p></div><div className="flex items-center gap-1"><button type="button" onClick={() => markAllRead.mutate()} disabled={!unreadCount || markAllRead.isPending} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40"><CheckCheck className="size-3.5" />已读</button><button type="button" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="关闭官方消息"><X className="size-5" /></button></div></header>
          {list.isLoading ? <div className="flex-1 space-y-3 overflow-y-auto p-5">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div> : null}
          {list.isError ? <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><p className="text-sm text-destructive">消息加载失败，请重试。</p><button type="button" onClick={() => void list.refetch()} className="mt-3 text-sm font-medium underline underline-offset-4">重新加载</button></div> : null}
          {!list.isLoading && !list.isError && !items.length ? <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><FolderOpen className="size-7 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">暂无官方消息。</p></div> : null}
          {items.length ? <div className="flex-1 overflow-y-auto p-4"><ul className="space-y-2.5">{items.map((notification) => { const unreadItem = notification.readAt === null; const failed = isPublicationRejected(notification) || isPublicationFailed(notification); return <li key={notification.id} className={cn("rounded-2xl border p-4", unreadItem ? "border-sky-200 bg-sky-50/70 dark:border-sky-900/60 dark:bg-sky-950/30" : "border-border bg-background")}><button type="button" onClick={() => { if (unreadItem) markRead.mutate(notification.id); }} className="w-full text-left"><div className="flex items-center justify-between gap-3"><span className={cn("text-sm font-medium", failed ? "text-destructive" : "text-emerald-600")}>{notificationEventLabel(notification.eventType)}</span><span className="shrink-0 text-xs text-muted-foreground">{createdAtText(notification.createdAt)}</span></div><p className="mt-2 text-sm font-medium text-card-foreground">{notification.title}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{notification.content}</p>{isPublicationRejected(notification) && notification.violations.length ? <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{violationText(notification.violations)}</p> : null}</button><div className="mt-3 flex items-center justify-between"><span>{notification.image ? <button type="button" onClick={() => { if (unreadItem) markRead.mutate(notification.id); setDetailImage(notification.image); }} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"><Eye className="size-3.5" />查看图片</button> : null}</span><button type="button" onClick={() => remove.mutate(notification.id)} disabled={remove.isPending} className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-destructive disabled:opacity-50" aria-label="删除该消息"><Trash2 className="size-4" /></button></div></li>; })}</ul>{list.hasNextPage ? <button type="button" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage} className="mt-4 flex h-9 w-full items-center justify-center rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted disabled:opacity-50">{list.isFetchingNextPage ? <LoaderCircle className="size-4 animate-spin" /> : "加载更多"}</button> : null}</div> : null}
        </>}
      </Dialog.Popup></Dialog.Viewport></Dialog.Portal>
    </Dialog.Root>
  </>;
}

function OfficialAssetDetail({ image, onClose }: { image: GenerationAsset; onClose: () => void }) {
  const [current, setCurrent] = useState(image); const [confirmDelete, setConfirmDelete] = useState(false); const [publish, setPublish] = useState(false);
  const favorite = useMutation({ mutationFn: (value: boolean) => setGenerationImageFavorites([current.id], value), onSuccess: (_result, value) => setCurrent((asset) => ({ ...asset, favorited: value })) });
  const removeAsset = useMutation({ mutationFn: () => deleteGenerationAssets([current.id]), onSuccess: onClose });
  return <AssetDetail asset={current} onClose={onClose} onPublish={() => setPublish(true)} onDelete={() => setConfirmDelete(true)} isDeleting={removeAsset.isPending} isFavorite={current.favorited} isFavoriteUpdating={favorite.isPending} onFavorite={() => favorite.mutate(!current.favorited)} deleteDialog={confirmDelete ? <Dialog.Root open modal onOpenChange={(open) => { if (!open) setConfirmDelete(false); }}><Dialog.Portal><Dialog.Backdrop className="fixed inset-0 z-[60] bg-slate-950/35" /><Dialog.Viewport className="fixed inset-0 z-[60] grid place-items-center p-4"><Dialog.Popup className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"><h2 className="text-lg font-semibold">删除图片？</h2><p className="mt-3 text-sm text-muted-foreground">此操作无法撤销。</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setConfirmDelete(false)} className="h-9 rounded-lg px-3 text-sm">取消</button><button type="button" onClick={() => removeAsset.mutate()} disabled={removeAsset.isPending} className="h-9 rounded-lg bg-destructive px-3 text-sm text-white">删除</button></div></Dialog.Popup></Dialog.Viewport></Dialog.Portal></Dialog.Root> : null} publishDialog={publish ? <PublicationFormDialog asset={current} onClose={() => setPublish(false)} onSuccess={(result) => { setPublish(false); setCurrent((asset) => ({ ...asset, publicationReviewStatus: result.status })); }} /> : null} />;
}
