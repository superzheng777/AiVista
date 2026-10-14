"use client";

import { type GenerationAsset } from "@/entities/image-resource/model/image-resource";
import type { OfficialNotification } from "@/entities/notification/model/notification";
import {
  deleteOfficialNotification,
  deleteOfficialNotifications,
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
import { Eye } from "lucide-react";
import { DeleteButton, NotificationList } from "./notification-list";

export function OfficialList({
  open,
  openingImageId,
  onOpenImage,
}: {
  open: boolean;
  openingImageId: string | null;
  onOpenImage: (image: GenerationAsset) => Promise<void>;
}) {
  return (
    <NotificationList<OfficialNotification>
      open={open}
      queryKey={officialNotificationQueryKeys.list}
      fetchPage={listOfficialNotifications}
      markRead={markOfficialNotificationRead}
      markAllRead={markAllOfficialNotificationsRead}
      remove={deleteOfficialNotification}
      removeMany={deleteOfficialNotifications}
      renderItem={(item, read, deleting, managing, selected, toggle) => {
        const failed = isPublicationRejected(item) || isPublicationFailed(item);
        const image = item.image;
        return (
          <li
            key={item.id}
            className={
              item.readAt
                ? "rounded-xl border p-3"
                : "rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-3"
            }
          >
            <div className="flex gap-3">
              {managing ? (
                <input
                  aria-label={`选择消息 ${item.id}`}
                  type="checkbox"
                  checked={selected}
                  onChange={toggle}
                  className="mt-1"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <button type="button" onClick={read} className="w-full text-left">
                  <p className={`text-sm font-medium ${failed ? "text-destructive" : "text-emerald-600"}`}>
                    {notificationEventLabel(item.eventType)}
                  </p>
                  <p className="mt-1 text-sm">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.content}</p>
                  {item.violations.length ? (
                    <p className="mt-2 text-xs text-destructive">{violationText(item.violations)}</p>
                  ) : null}
                </button>
                {image ? (
                  <button
                    type="button"
                    disabled={openingImageId === image.id}
                    onClick={() => {
                      read();
                      void onOpenImage(image);
                    }}
                    className="mt-3 inline-flex items-center gap-1 text-xs disabled:opacity-60"
                  >
                    <Eye className="size-3.5" />
                    查看图片
                  </button>
                ) : null}
              </div>
              {!managing ? <DeleteButton onDelete={deleting} /> : null}
            </div>
          </li>
        );
      }}
    />
  );
}
