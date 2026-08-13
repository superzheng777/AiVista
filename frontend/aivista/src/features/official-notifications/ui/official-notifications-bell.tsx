"use client";
/* eslint-disable @next/next/no-img-element */

import { Dialog } from "@base-ui/react/dialog";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Eye, FolderOpen, Trash2, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { needsImageUrlRefresh, type GenerationAsset } from "@/entities/generation/model/generation";
import type { InteractionNotification, OfficialNotification } from "@/entities/notification/model/notification";
import { AssetDetail } from "@/features/assets/ui/assets-workspace";
import { deleteGenerationAssets, getGenerationAsset, setGenerationImageFavorites } from "@/features/assets/api/asset-api";
import { useGenerationEventStream } from "@/features/generation/model/generation-event-stream-provider";
import { deleteInteractionNotification, deleteInteractionNotifications, interactionNotificationQueryKeys, listInteractionNotifications, markAllInteractionNotificationsRead, markInteractionNotificationRead } from "@/features/interaction-notifications/api/interaction-notifications-api";
import { deleteOfficialNotification, deleteOfficialNotifications, fetchOfficialNotificationUnreadCount, listOfficialNotifications, markAllOfficialNotificationsRead, markOfficialNotificationRead, officialNotificationQueryKeys } from "@/features/official-notifications/api/official-notifications-api";
import { isPublicationFailed, isPublicationRejected, notificationEventLabel, violationText } from "@/features/official-notifications/model/notification-display";
import { PublicationFormDialog } from "@/features/publication/ui/publication-form-dialog";

type Tab = "interaction" | "official";
type Message = InteractionNotification | OfficialNotification;
const formatTime = (value: string) => new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));

/** Prevent an SSE/reconnect refresh from refetching every previously loaded cursor page. */
export function retainFirstNotificationPage(client: ReturnType<typeof useQueryClient>, queryKey: readonly string[]) {
  client.setQueryData<{ pages: unknown[]; pageParams: unknown[] }>(queryKey, (current) => current ? { pages: current.pages.slice(0, 1), pageParams: current.pageParams.slice(0, 1) } : current);
  return client.refetchQueries({ queryKey, type: "active" });
}

export function OfficialNotificationsBell() {
  const router = useRouter();
  const client = useQueryClient();
  const { notificationRefreshVersion, publicationRefreshVersion } = useGenerationEventStream();
  const [open, setOpen] = useState(false); const [tab, setTab] = useState<Tab>("interaction"); const [image, setImage] = useState<GenerationAsset | null>(null); const [openingImageId, setOpeningImageId] = useState<string | null>(null); const [openImageError, setOpenImageError] = useState<string | null>(null);
  const unread = useQuery({ queryKey: officialNotificationQueryKeys.unreadCount, queryFn: fetchOfficialNotificationUnreadCount });
  useEffect(() => {
    if (notificationRefreshVersion || publicationRefreshVersion) void client.invalidateQueries({ queryKey: officialNotificationQueryKeys.unreadCount });
    if (open && tab === "interaction" && notificationRefreshVersion) void retainFirstNotificationPage(client, interactionNotificationQueryKeys.list);
    if (open && tab === "official" && publicationRefreshVersion) void retainFirstNotificationPage(client, officialNotificationQueryKeys.list);
  }, [client, notificationRefreshVersion, open, publicationRefreshVersion, tab]);
  async function openImage(item: GenerationAsset): Promise<void> {
    if (item.publicationReviewStatus === "APPROVED") {
      setOpen(false);
      router.push(`/inspirations/${item.id}`);
      return;
    }
    if (!needsImageUrlRefresh(item.urlExpiresAt)) {
      setImage(item);
      return;
    }
    setOpeningImageId(item.id);
    try {
      setOpenImageError(null);
      setImage(await getGenerationAsset(item.id));
    } catch {
      setOpenImageError("图片访问地址刷新失败，请稍后重试。");
    } finally {
      setOpeningImageId(null);
    }
  }
  return <><button type="button" onClick={() => setOpen(true)} aria-label="消息中心" className="relative grid size-10 place-items-center rounded-xl text-muted-foreground hover:bg-muted"><Bell className="size-5" />{unread.data ? <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] leading-4 text-white">{unread.data > 99 ? "99+" : unread.data}</span> : null}</button><Dialog.Root open={open} modal onOpenChange={setOpen}><Dialog.Portal><Dialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/20" /><Dialog.Viewport className="fixed inset-0 z-50"><Dialog.Popup className="absolute inset-y-0 left-0 flex w-full max-w-md flex-col border-r border-border bg-card shadow-2xl md:left-24">{image ? <MessageImage image={image} onClose={() => setImage(null)} /> : <><header className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="text-lg font-semibold">消息中心</h2><div className="mt-3 flex gap-1 rounded-lg bg-muted p-1"><TabButton active={tab === "interaction"} onClick={() => setTab("interaction")}>互动</TabButton><TabButton active={tab === "official"} onClick={() => setTab("official")}>官方</TabButton></div></div><button type="button" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted"><X className="size-5" /></button></header>{openImageError ? <p role="status" className="px-5 py-3 text-sm text-destructive">{openImageError}</p> : null}{tab === "interaction" ? <InteractionList open={open} openingImageId={openingImageId} onOpenImage={openImage} /> : <OfficialList open={open} openingImageId={openingImageId} onOpenImage={openImage} />}</>}</Dialog.Popup></Dialog.Viewport></Dialog.Portal></Dialog.Root></>;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) { return <button type="button" onClick={onClick} className={`rounded-md px-3 py-1.5 text-xs font-medium ${active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>{children}</button>; }

function InteractionList({ open, openingImageId, onOpenImage }: { open: boolean; openingImageId: string | null; onOpenImage: (image: GenerationAsset) => Promise<void> }) {
  return <NotificationList<InteractionNotification> open={open} queryKey={interactionNotificationQueryKeys.list} fetchPage={listInteractionNotifications} markRead={markInteractionNotificationRead} markAllRead={markAllInteractionNotificationsRead} remove={deleteInteractionNotification} removeMany={deleteInteractionNotifications} renderItem={(item, read, deleting, managing, selected, toggle) => <li key={item.id} className={item.readAt ? "rounded-xl border p-3" : "rounded-xl border border-sky-200 bg-sky-50/70 p-3"}><div className="flex gap-3">{managing ? <input aria-label={`选择消息 ${item.id}`} type="checkbox" checked={selected} onChange={toggle} className="mt-1" /> : null}<button type="button" onClick={read} className="min-w-0 flex-1 text-left"><p className="text-sm"><b>{item.actor.nickname}</b> {item.eventType === "USER_FOLLOWED" ? "关注了你" : "赞了你的作品"}</p><p className="mt-1 text-xs text-muted-foreground">{formatTime(item.createdAt)}</p></button>{item.image ? <button type="button" disabled={openingImageId === item.image.id} onClick={() => { read(); void onOpenImage(item.image!); }} className="shrink-0 disabled:opacity-60"><img src={item.image.url} alt="关联作品" loading="lazy" decoding="async" className="size-12 rounded-lg object-cover" /></button> : null}{!managing ? <DeleteButton onDelete={deleting} /> : null}</div></li>} />;
}

function OfficialList({ open, openingImageId, onOpenImage }: { open: boolean; openingImageId: string | null; onOpenImage: (image: GenerationAsset) => Promise<void> }) {
  return <NotificationList<OfficialNotification> open={open} queryKey={officialNotificationQueryKeys.list} fetchPage={listOfficialNotifications} markRead={markOfficialNotificationRead} markAllRead={markAllOfficialNotificationsRead} remove={deleteOfficialNotification} removeMany={deleteOfficialNotifications} renderItem={(item, read, deleting, managing, selected, toggle) => { const failed = isPublicationRejected(item) || isPublicationFailed(item); return <li key={item.id} className={item.readAt ? "rounded-xl border p-3" : "rounded-xl border border-sky-200 bg-sky-50/70 p-3"}><div className="flex gap-3">{managing ? <input aria-label={`选择消息 ${item.id}`} type="checkbox" checked={selected} onChange={toggle} className="mt-1" /> : null}<div className="min-w-0 flex-1"><button type="button" onClick={read} className="w-full text-left"><p className={`text-sm font-medium ${failed ? "text-destructive" : "text-emerald-600"}`}>{notificationEventLabel(item.eventType)}</p><p className="mt-1 text-sm">{item.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.content}</p>{item.violations.length ? <p className="mt-2 text-xs text-destructive">{violationText(item.violations)}</p> : null}</button>{item.image ? <button type="button" disabled={openingImageId === item.image.id} onClick={() => { read(); void onOpenImage(item.image!); }} className="mt-3 inline-flex items-center gap-1 text-xs disabled:opacity-60"><Eye className="size-3.5" />查看图片</button> : null}</div>{!managing ? <DeleteButton onDelete={deleting} /> : null}</div></li>; }} />;
}

function NotificationList<T extends Message>({ open, queryKey, fetchPage, markRead, markAllRead, remove, removeMany, renderItem }: { open: boolean; queryKey: readonly string[]; fetchPage: (cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null }>; markRead: (id: string) => Promise<void>; markAllRead: () => Promise<void>; remove: (id: string) => Promise<void>; removeMany: (ids: string[]) => Promise<void>; renderItem: (item: T, read: () => void, deleting: () => void, managing: boolean, selected: boolean, toggle: () => void) => ReactNode }) {
  const client = useQueryClient(); const [managing, setManaging] = useState(false); const [selected, setSelected] = useState<Set<string>>(new Set());
  const list = useInfiniteQuery({ queryKey, queryFn: ({ pageParam }) => fetchPage(pageParam), initialPageParam: null as string | null, getNextPageParam: (page) => page.nextCursor, enabled: open });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const refresh = () => { void retainFirstNotificationPage(client, queryKey); void client.invalidateQueries({ queryKey: officialNotificationQueryKeys.unreadCount }); };
  const read = useMutation({ mutationFn: markRead, onSuccess: refresh }); const allRead = useMutation({ mutationFn: markAllRead, onSuccess: refresh }); const removeOne = useMutation({ mutationFn: remove, onSuccess: refresh }); const bulk = useMutation({ mutationFn: removeMany, onSuccess: () => { setSelected(new Set()); setManaging(false); refresh(); } });
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return <section className="flex min-h-0 flex-1 flex-col"><ListToolbar unread={items.filter((item) => !item.readAt).length} managing={managing} onManage={() => { setManaging((value) => !value); setSelected(new Set()); }} onAllRead={() => allRead.mutate()} /><div className="flex-1 overflow-y-auto p-4">{!items.length && !list.isLoading ? <Empty /> : <ul className="space-y-2">{items.map((item) => renderItem(item, () => { if (!item.readAt) read.mutate(item.id); }, () => { if (window.confirm("删除这条消息？")) removeOne.mutate(item.id); }, managing, selected.has(item.id), () => toggle(item.id)))}</ul>}{managing && selected.size ? <button type="button" onClick={() => { if (window.confirm(`删除已选 ${selected.size} 条消息？`)) bulk.mutate([...selected]); }} className="mt-4 h-9 w-full rounded-lg bg-destructive text-sm text-white">删除已选 {selected.size} 条</button> : null}{list.hasNextPage ? <button type="button" onClick={() => void list.fetchNextPage()} className="mt-4 h-9 w-full rounded-lg border text-sm">加载更多</button> : null}</div></section>;
}

function DeleteButton({ onDelete }: { onDelete: () => void }) { return <button type="button" onClick={onDelete} className="shrink-0 text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>; }
function ListToolbar({ unread, onAllRead, managing, onManage }: { unread: number; onAllRead: () => void; managing: boolean; onManage: () => void }) { return <div className="flex items-center justify-between border-b px-5 py-3 text-xs"><span>{unread ? `${unread} 条未读` : "没有未读消息"}</span><div className="flex gap-2"><button type="button" onClick={onAllRead} disabled={!unread} className="inline-flex items-center gap-1 disabled:opacity-40"><CheckCheck className="size-3.5" />全部已读</button><button type="button" onClick={onManage}>{managing ? "完成" : "管理"}</button></div></div>; }
function Empty() { return <div className="grid h-full place-items-center text-center text-sm text-muted-foreground"><div><FolderOpen className="mx-auto size-6" /><p className="mt-2">暂无消息</p></div></div>; }
function MessageImage({ image, onClose }: { image: GenerationAsset; onClose: () => void }) { return <OfficialAssetDetail image={image} onClose={onClose} />; }
function OfficialAssetDetail({ image, onClose }: { image: GenerationAsset; onClose: () => void }) { const [current, setCurrent] = useState(image); const [publish, setPublish] = useState(false); const favorite = useMutation({ mutationFn: (value: boolean) => setGenerationImageFavorites([current.id], value), onSuccess: (_result, value) => setCurrent((asset) => ({ ...asset, favorited: value })) }); const remove = useMutation({ mutationFn: () => deleteGenerationAssets([current.id]), onSuccess: onClose }); return <AssetDetail asset={current} onClose={onClose} onPublish={() => setPublish(true)} onDelete={() => { if (window.confirm("删除图片？")) remove.mutate(); }} isDeleting={remove.isPending} isFavorite={current.favorited} isFavoriteUpdating={favorite.isPending} onFavorite={() => favorite.mutate(!current.favorited)} deleteDialog={null} publishDialog={publish ? <PublicationFormDialog asset={current} onClose={() => setPublish(false)} onSuccess={(result) => { setPublish(false); setCurrent((asset) => ({ ...asset, publicationReviewStatus: result.status })); }} /> : null} />; }
