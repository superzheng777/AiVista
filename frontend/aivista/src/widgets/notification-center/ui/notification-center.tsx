"use client";

import { needsImageUrlRefresh, type GenerationAsset } from "@/entities/image-resource/model/image-resource";
import { useUserEventStreamStore } from "@/entities/user-event-stream/model/user-event-stream-store";
import { getGenerationAsset } from "@/features/assets/api/asset-api";
import { updateInspirationInFeeds } from "@/features/inspiration/model/inspiration-cache";
import { usePublicImageDetail } from "@/features/inspiration/model/use-public-image-detail";
import { PublicImageDetailOverlay } from "@/features/inspiration/ui/public-image-detail-overlay";
import { PublicImageOpenError } from "@/features/inspiration/ui/public-image-open-error";
import { interactionNotificationQueryKeys } from "@/features/interaction-notifications/api/interaction-notifications-api";
import { fetchNotificationUnreadCount, notificationQueryKeys } from "@/features/notifications/api/notification-api";
import { officialNotificationQueryKeys } from "@/features/official-notifications/api/official-notifications-api";
import { Dialog } from "@base-ui/react/dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, X } from "lucide-react";
import { useEffect, useState } from "react";
import { retainFirstNotificationPage } from "../model/notification-pagination";
import { InteractionList } from "./interaction-notification-list";
import { MessageImage } from "./notification-asset-detail";
import { OfficialList } from "./official-notification-list";

type Tab = "interaction" | "official";

export function NotificationCenter() {
  const client = useQueryClient();
  const publicDetail = usePublicImageDetail(null, [], (image) => updateInspirationInFeeds(client, image));
  const notificationRefreshVersion = useUserEventStreamStore((state) => state.notificationRefreshVersion);
  const publicationRefreshVersion = useUserEventStreamStore((state) => state.publicationRefreshVersion);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("official");
  const [image, setImage] = useState<GenerationAsset | null>(null);
  const [openingImageId, setOpeningImageId] = useState<string | null>(null);
  const [openImageError, setOpenImageError] = useState<string | null>(null);
  const unread = useQuery({
    queryKey: notificationQueryKeys.unreadCount,
    queryFn: fetchNotificationUnreadCount,
  });
  useEffect(() => {
    if (notificationRefreshVersion || publicationRefreshVersion)
      void client.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount });
    if (open && tab === "interaction" && notificationRefreshVersion)
      void retainFirstNotificationPage(client, interactionNotificationQueryKeys.list);
    if (open && tab === "official" && publicationRefreshVersion)
      void retainFirstNotificationPage(client, officialNotificationQueryKeys.list);
  }, [client, notificationRefreshVersion, open, publicationRefreshVersion, tab]);
  async function openImage(item: GenerationAsset): Promise<void> {
    if (item.publicationReviewStatus === "APPROVED") {
      setOpen(false);
      await publicDetail.open(item);
      return;
    }
    if (!needsImageUrlRefresh(item.imageUrls.display)) {
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
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setTab(unread.data?.officialUnreadCount ? "official" : "interaction");
          setOpen(true);
        }}
        aria-label="消息中心"
        className="relative grid size-10 place-items-center rounded-xl text-muted-foreground hover:bg-muted"
      >
        <Bell className="size-5" />
        {unread.data?.totalUnreadCount ? (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] leading-4 text-white">
            {unread.data.totalUnreadCount > 99 ? "99+" : unread.data.totalUnreadCount}
          </span>
        ) : null}
      </button>
      <Dialog.Root open={open} modal onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-[var(--overlay)]" />
          <Dialog.Viewport className="fixed inset-0 z-50">
            <Dialog.Popup className="absolute inset-y-0 left-0 flex w-full max-w-md flex-col border-r border-border bg-card shadow-2xl md:left-24">
              {image ? (
                <MessageImage image={image} onClose={() => setImage(null)} />
              ) : (
                <>
                  <header className="flex items-center justify-between border-b border-border px-5 py-4">
                    <div>
                      <h2 className="text-lg font-semibold">消息中心</h2>
                      <div className="mt-3 flex gap-1 rounded-lg bg-muted p-1">
                        <TabButton active={tab === "interaction"} onClick={() => setTab("interaction")}>
                          互动
                        </TabButton>
                        <TabButton active={tab === "official"} onClick={() => setTab("official")}>
                          官方
                        </TabButton>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
                    >
                      <X className="size-5" />
                    </button>
                  </header>
                  {openImageError ? (
                    <p role="status" className="px-5 py-3 text-sm text-destructive">
                      {openImageError}
                    </p>
                  ) : null}
                  {tab === "interaction" ? (
                    <InteractionList open={open} openingImageId={openingImageId} onOpenImage={openImage} />
                  ) : (
                    <OfficialList open={open} openingImageId={openingImageId} onOpenImage={openImage} />
                  )}
                </>
              )}
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
      {publicDetail.image ? (
        <PublicImageDetailOverlay
          sourceQueryKey={publicDetail.sourceQueryKey}
          image={publicDetail.image}
          onClose={publicDetail.close}
          onImageChange={publicDetail.updateImage}
        />
      ) : null}
      {publicDetail.openError ? (
        <PublicImageOpenError message={publicDetail.openError} onDismiss={publicDetail.dismissOpenError} />
      ) : null}
    </>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-medium ${active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
    >
      {children}
    </button>
  );
}
