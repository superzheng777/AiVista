"use client";

import type { InteractionNotification, OfficialNotification } from "@/entities/notification/model/notification";
import { notificationQueryKeys } from "@/features/notifications/api/notification-api";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, FolderOpen, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { retainFirstNotificationPage } from "../model/notification-pagination";

type Message = InteractionNotification | OfficialNotification;

export function NotificationList<T extends Message>({
  open,
  queryKey,
  fetchPage,
  markRead,
  markAllRead,
  remove,
  removeMany,
  renderItem,
}: {
  open: boolean;
  queryKey: readonly string[];
  fetchPage: (cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null }>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  removeMany: (ids: string[]) => Promise<void>;
  renderItem: (
    item: T,
    read: () => void,
    deleting: () => void,
    managing: boolean,
    selected: boolean,
    toggle: () => void,
  ) => ReactNode;
}) {
  const client = useQueryClient();
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const list = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: open,
  });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const refresh = () => {
    void retainFirstNotificationPage(client, queryKey);
    void client.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount });
  };
  const read = useMutation({ mutationFn: markRead, onSuccess: refresh });
  const allRead = useMutation({ mutationFn: markAllRead, onSuccess: refresh });
  const removeOne = useMutation({ mutationFn: remove, onSuccess: refresh });
  const bulk = useMutation({
    mutationFn: removeMany,
    onSuccess: () => {
      setSelected(new Set());
      setManaging(false);
      refresh();
    },
  });
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <ListToolbar
        unread={items.filter((item) => !item.readAt).length}
        managing={managing}
        onManage={() => {
          setManaging((value) => !value);
          setSelected(new Set());
        }}
        onAllRead={() => allRead.mutate()}
      />
      <div className="flex-1 overflow-y-auto p-4">
        {list.isError ? (
          <p role="alert" className="py-6 text-center text-sm text-destructive">
            消息加载失败，请刷新后重试。
          </p>
        ) : !items.length && !list.isLoading ? (
          <Empty />
        ) : (
          <ul className="space-y-2">
            {items.map((item) =>
              renderItem(
                item,
                () => {
                  if (!item.readAt) read.mutate(item.id);
                },
                () => {
                  if (window.confirm("删除这条消息？")) removeOne.mutate(item.id);
                },
                managing,
                selected.has(item.id),
                () => toggle(item.id),
              ),
            )}
          </ul>
        )}
        {managing && selected.size ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`删除已选 ${selected.size} 条消息？`)) bulk.mutate([...selected]);
            }}
            className="mt-4 h-9 w-full rounded-lg bg-destructive text-sm text-white"
          >
            删除已选 {selected.size} 条
          </button>
        ) : null}
        {list.hasNextPage ? (
          <button
            type="button"
            onClick={() => void list.fetchNextPage()}
            className="mt-4 h-9 w-full rounded-lg border text-sm"
          >
            加载更多
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function DeleteButton({ onDelete }: { onDelete: () => void }) {
  return (
    <button type="button" onClick={onDelete} className="shrink-0 text-muted-foreground hover:text-destructive">
      <Trash2 className="size-4" />
    </button>
  );
}

function ListToolbar({
  unread,
  onAllRead,
  managing,
  onManage,
}: {
  unread: number;
  onAllRead: () => void;
  managing: boolean;
  onManage: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b px-5 py-3 text-xs">
      <span>{unread ? `${unread} 条未读` : "没有未读消息"}</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAllRead}
          disabled={!unread}
          className="inline-flex items-center gap-1 disabled:opacity-40"
        >
          <CheckCheck className="size-3.5" />
          全部已读
        </button>
        <button type="button" onClick={onManage}>
          {managing ? "完成" : "管理"}
        </button>
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
      <div>
        <FolderOpen className="mx-auto size-6" />
        <p className="mt-2">暂无消息</p>
      </div>
    </div>
  );
}
