"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@base-ui/react/dialog";
import { Bell, CheckCheck, Eye, FolderOpen, ImageOff, LoaderCircle, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { OfficialNotification } from "@/entities/notification/model/notification";
import { getGenerationAsset } from "@/features/assets/api/asset-api";
import { useGenerationEventStream } from "@/features/generation/model/generation-event-stream-provider";
import {
  fetchOfficialNotificationUnreadCount,
  deleteAllOfficialNotifications,
  deleteOfficialNotification,
  listOfficialNotifications,
  markAllOfficialNotificationsRead,
  markOfficialNotificationRead,
  officialNotificationQueryKeys,
} from "@/features/official-notifications/api/official-notifications-api";
import {
  isPublicationFailed,
  isPublicationRejected,
  notificationEventLabel,
  violationText,
} from "@/features/official-notifications/model/notification-display";
import { cn } from "@/lib/utils";
import { getApiErrorCode } from "@/shared/api/api-response";

function unreadBadgeText(count: number): string {
  return count > 99 ? "99+" : String(count);
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

export function OfficialNotificationsBell() {
  const queryClient = useQueryClient();
  const { publicationRefreshVersion } = useGenerationEventStream();
  const [isOpen, setIsOpen] = useState(false);
  const [viewingImageId, setViewingImageId] = useState<string | null>(null);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const unreadCountQuery = useQuery({
    queryKey: officialNotificationQueryKeys.unreadCount,
    queryFn: fetchOfficialNotificationUnreadCount,
  });
  const listQuery = useQuery({
    queryKey: officialNotificationQueryKeys.list,
    queryFn: listOfficialNotifications,
    enabled: isOpen,
  });

  // 收到发布终态 SSE：刷新未读数；抽屉打开时刷新列表。
  useEffect(() => {
    if (publicationRefreshVersion === 0) return;
    void queryClient.invalidateQueries({ queryKey: officialNotificationQueryKeys.unreadCount });
    if (isOpen) void queryClient.invalidateQueries({ queryKey: officialNotificationQueryKeys.list });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicationRefreshVersion]);

  const markReadMutation = useMutation({
    mutationFn: markOfficialNotificationRead,
    onSuccess: (_result, notificationId) => {
      queryClient.setQueryData<OfficialNotification[]>(officialNotificationQueryKeys.list, (current) =>
        current?.map((item) => item.id === notificationId ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item));
      void queryClient.invalidateQueries({ queryKey: officialNotificationQueryKeys.unreadCount });
    },
  });
  const markAllReadMutation = useMutation({
    mutationFn: markAllOfficialNotificationsRead,
    onSuccess: () => {
      queryClient.setQueryData<OfficialNotification[]>(officialNotificationQueryKeys.list, (current) =>
        current?.map((item) => item.readAt === null ? { ...item, readAt: new Date().toISOString() } : item));
      void queryClient.invalidateQueries({ queryKey: officialNotificationQueryKeys.unreadCount });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteOfficialNotification,
    onSuccess: (_result, notificationId) => {
      queryClient.setQueryData<OfficialNotification[]>(officialNotificationQueryKeys.list, (current) =>
        current?.filter((item) => item.id !== notificationId));
      void queryClient.invalidateQueries({ queryKey: officialNotificationQueryKeys.unreadCount });
    },
  });
  const deleteAllMutation = useMutation({
    mutationFn: deleteAllOfficialNotifications,
    onSuccess: () => {
      queryClient.setQueryData<OfficialNotification[]>(officialNotificationQueryKeys.list, []);
      setViewingImageId(null);
      setIsClearConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: officialNotificationQueryKeys.unreadCount });
    },
  });

  const unreadCount = unreadCountQuery.data ?? 0;

  return (
    <>
      <button type="button" onClick={() => { setViewingImageId(null); setIsOpen(true); }} aria-label={`官方消息${unreadCount > 0 ? `，${unreadCount} 条未读` : ""}`} className="relative grid size-10 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Bell className="size-5" />
        {unreadCount > 0 ? <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-white">{unreadBadgeText(unreadCount)}</span> : null}
      </button>

      <Dialog.Root open={isOpen} modal onOpenChange={(open) => setIsOpen(open)}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/20 backdrop-blur-[1px]" />
          <Dialog.Viewport className="fixed inset-0 z-50">
            <Dialog.Popup aria-labelledby="official-notifications-title" className="absolute inset-y-0 left-0 flex w-full max-w-md flex-col border-r border-border bg-card shadow-2xl md:left-24">
            <header className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 id="official-notifications-title" className="text-lg font-semibold text-card-foreground">官方消息</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{unreadCount > 0 ? `${unreadCount} 条未读` : "没有未读消息"}</p>
              </div>
              <div className="flex items-center gap-1"><button type="button" onClick={() => void markAllReadMutation.mutateAsync()} disabled={!unreadCount || markAllReadMutation.isPending} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40" aria-label="全部标为已读"><CheckCheck className="size-3.5" />已读</button><button type="button" onClick={() => setIsClearConfirmOpen(true)} disabled={!listQuery.data?.length || deleteAllMutation.isPending} className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40" aria-label="清空全部消息"><Trash2 className="size-4" /></button><button type="button" onClick={() => setIsOpen(false)} className="grid size-9 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="关闭消息抽屉"><X className="size-5" /></button></div>
            </header>

            {listQuery.isLoading ? <div className="flex-1 space-y-3 overflow-y-auto p-5">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div> : null}
            {listQuery.isError ? <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><p className="text-sm text-destructive">消息加载失败，请重试。</p><button type="button" onClick={() => void listQuery.refetch()} className="mt-3 text-sm font-medium underline underline-offset-4">重新加载</button></div> : null}
            {!listQuery.isLoading && !listQuery.isError && !listQuery.data?.length ? <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><FolderOpen className="size-7 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">暂无官方消息。</p></div> : null}

            {listQuery.data?.length ? (
              <div className="flex-1 overflow-y-auto p-4">
                {viewingImageId ? <ImageAssetPreview imageId={viewingImageId} /> : null}
                <ul className="space-y-2.5">
                  {listQuery.data.map((notification) => {
                    const isUnread = notification.readAt === null;
                    const isRejected = isPublicationRejected(notification) || isPublicationFailed(notification);
                    return (
                      <li key={notification.id} className={cn("rounded-2xl border p-4 transition", isUnread ? "border-sky-200 bg-sky-50/70 dark:border-sky-900/60 dark:bg-sky-950/30" : "border-border bg-background")}>
                        <button type="button" onClick={() => { void markReadMutation.mutateAsync(notification.id); }} className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <div className="flex items-center justify-between gap-3">
                            <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", isRejected ? "text-destructive" : "text-emerald-600")}><span className={cn("size-1.5 rounded-full", isRejected ? "bg-destructive" : "bg-emerald-500")} />{notificationEventLabel(notification.eventType)}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{createdAtText(notification.createdAt)}</span>
                          </div>
                          <p className="mt-2 text-sm font-medium text-card-foreground">{notification.title}</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{notification.content}</p>
                          {isPublicationRejected(notification) && notification.violations.length ? <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{violationText(notification.violations)}</p> : null}
                        </button>
                        <div className="mt-3 flex items-center justify-between gap-2">{notification.imageId ? <button type="button" onClick={() => { if (isUnread) void markReadMutation.mutateAsync(notification.id); setViewingImageId(notification.imageId); }} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"><Eye className="size-3.5" />查看图片</button> : <span />}{<button type="button" onClick={() => void deleteMutation.mutateAsync(notification.id)} disabled={deleteMutation.isPending} className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50" aria-label="删除该消息"><Trash2 className="size-4" /></button>}</div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={isClearConfirmOpen} modal onOpenChange={setIsClearConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-[60] bg-slate-950/45" />
          <Dialog.Viewport className="fixed inset-0 z-[60] grid place-items-center p-4">
            <Dialog.Popup aria-labelledby="clear-official-notifications-title" className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
              <h2 id="clear-official-notifications-title" className="text-lg font-semibold">清空全部消息？</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">已删除的消息将不再显示，此操作无法撤销。</p>
              <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setIsClearConfirmOpen(false)} disabled={deleteAllMutation.isPending} className="h-9 rounded-lg px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted">取消</button><button type="button" onClick={() => void deleteAllMutation.mutateAsync()} disabled={deleteAllMutation.isPending} className="inline-flex h-9 items-center gap-2 rounded-lg bg-destructive px-3 text-sm font-medium text-white transition hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-60">{deleteAllMutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : null}清空</button></div>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function ImageAssetPreview({ imageId }: { imageId: string }) {
  // 统一图片 DTO 已覆盖资产/发布/灵感三种详情页的全部展示数据，交互按钮差异与预览无关，一律走资产详情。
  // 后端单图查询对“已发布但资产页已删”的图片同样返回资源（资源由发布状态保障），因此无需按消息类型区分数据源。
  const assetQuery = useQuery({
    queryKey: ["assets", "preview", imageId],
    queryFn: () => getGenerationAsset(imageId),
    retry: false,
  });
  const notFound = getApiErrorCode(assetQuery.error) === 40401;

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-sm font-medium text-card-foreground">图片预览</span>
      </div>
      <div className="p-4">
        {assetQuery.isLoading ? <div className="flex h-48 items-center justify-center"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div> : null}
        {notFound ? <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground"><ImageOff className="size-6" /><span>该图片已删除</span></div> : null}
        {assetQuery.isError && !notFound ? <div className="flex h-48 items-center justify-center text-sm text-destructive">图片加载失败，请稍后重试。</div> : null}
        {assetQuery.data ? (
          // 私有签名 URL 不得经过 Next 图片优化器。
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetQuery.data.url} alt={assetQuery.data.title ?? "已发布的图片"} referrerPolicy="no-referrer" className="aspect-square w-full rounded-lg bg-muted object-cover" />
        ) : null}
      </div>
    </div>
  );
}
