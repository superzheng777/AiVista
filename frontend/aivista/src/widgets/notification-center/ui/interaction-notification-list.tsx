"use client";

/* eslint-disable @next/next/no-img-element */
import { type GenerationAsset } from "@/entities/image-resource/model/image-resource";
import type { InteractionNotification } from "@/entities/notification/model/notification";
import {
  deleteInteractionNotification,
  deleteInteractionNotifications,
  interactionNotificationQueryKeys,
  listInteractionNotifications,
  markAllInteractionNotificationsRead,
  markInteractionNotificationRead,
} from "@/features/interaction-notifications/api/interaction-notifications-api";
import { formatTime } from "../lib/notification-presentation";
import { DeleteButton, NotificationList } from "./notification-list";

export function InteractionList({
  open,
  openingImageId,
  onOpenImage,
}: {
  open: boolean;
  openingImageId: string | null;
  onOpenImage: (image: GenerationAsset) => Promise<void>;
}) {
  return (
    <NotificationList<InteractionNotification>
      open={open}
      queryKey={interactionNotificationQueryKeys.list}
      fetchPage={listInteractionNotifications}
      markRead={markInteractionNotificationRead}
      markAllRead={markAllInteractionNotificationsRead}
      remove={deleteInteractionNotification}
      removeMany={deleteInteractionNotifications}
      renderItem={(item, read, deleting, managing, selected, toggle) => {
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
              <button type="button" onClick={read} className="min-w-0 flex-1 text-left">
                <p className="text-sm">
                  <b>{item.actor.nickname}</b> {item.eventType === "USER_FOLLOWED" ? "关注了你" : "赞了你的作品"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{formatTime(item.createdAt)}</p>
              </button>
              {image?.imageUrls.thumbnail ? (
                <button
                  type="button"
                  disabled={openingImageId === image.id}
                  onClick={() => {
                    read();
                    void onOpenImage(image);
                  }}
                  className="shrink-0 disabled:opacity-60"
                >
                  <img
                    src={image.imageUrls.thumbnail.url}
                    alt="关联作品"
                    loading="lazy"
                    decoding="async"
                    className="size-12 rounded-lg object-cover"
                  />
                </button>
              ) : null}
              {!managing ? <DeleteButton onDelete={deleting} /> : null}
            </div>
          </li>
        );
      }}
    />
  );
}
