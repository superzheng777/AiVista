"use client";

import { Menu } from "@base-ui/react/menu";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, LoaderCircle, MessageSquare, MoreHorizontal, PencilLine, Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type { SessionDetail, SessionSummary } from "@/entities/generation/model/session";
import { cn } from "@/shared/lib/cn";
import { getApiErrorMessage } from "@/shared/api/api-response";
import { deleteGenerationSession, generationQueryKeys, updateGenerationSessionTitle } from "../api/generation-api";
import type { GenerationSessionIndicator } from "../model/generation-event-stream-parsing";
import { sessionTitleFormSchema, type SessionTitleFormValues } from "../model/session-title-form";

export function SessionHistoryItem({
  session,
  selected,
  indicator,
  onSelect,
  onDeleted,
}: {
  session: SessionSummary;
  selected: boolean;
  indicator?: GenerationSessionIndicator;
  onSelect: () => void;
  onDeleted: (sessionId: string) => Promise<void>;
}) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(false);
  const savingRef = useRef(false);
  const errorId = useId();
  const remove = useMutation({
    mutationFn: () => deleteGenerationSession(session.sessionId),
    onSuccess: () => onDeleted(session.sessionId),
  });
  const form = useForm<SessionTitleFormValues>({
    resolver: zodResolver(sessionTitleFormSchema),
    defaultValues: { title: session.title },
  });
  const rename = useMutation({
    mutationFn: (value: string) => updateGenerationSessionTitle(session.sessionId, value),
    onSuccess: ({ title: savedTitle }) => {
      client.setQueryData<SessionSummary[]>(generationQueryKeys.sessions(), (sessions) =>
        sessions?.map((item) => (item.sessionId === session.sessionId ? { ...item, title: savedTitle } : item)),
      );
      client.setQueryData<SessionDetail>(generationQueryKeys.session(session.sessionId), (value) =>
        value ? { ...value, title: savedTitle } : value,
      );
      editingRef.current = false;
      setEditing(false);
    },
  });
  async function save({ title }: SessionTitleFormValues) {
    if (!editingRef.current || savingRef.current) return;
    if (title === session.title) {
      editingRef.current = false;
      setEditing(false);
      return;
    }
    savingRef.current = true;
    try {
      await rename.mutateAsync(title);
    } catch {
      // The mutation error is displayed below; preserve the input for retry.
    } finally {
      savingRef.current = false;
    }
  }
  const error = form.formState.errors.title?.message ?? (rename.isError ? "名称修改失败，请重试。" : undefined);
  const iconButton =
    "inline-flex size-7 shrink-0 items-center justify-center rounded-[4px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50";

  return (
    <div
      className={cn(
        "rounded-[7px] border text-sm transition",
        selected
          ? "border-[var(--accent-border)] bg-[var(--active-bg)] font-medium text-[var(--primary)]"
          : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] hover:text-[var(--primary)]",
      )}
    >
      {editing ? (
        <form
          className="px-2 py-2"
          noValidate
          onSubmit={(event) => void form.handleSubmit(save)(event)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget) && editingRef.current) {
              void form.handleSubmit(save)();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
            if (event.key === "Escape" && !savingRef.current) {
              event.preventDefault();
              editingRef.current = false;
              setEditing(false);
            }
          }}
        >
          <div className="flex min-h-9 items-center gap-1">
            <input
              autoFocus
              aria-label="会话名称"
              {...form.register("title")}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              maxLength={100}
              required
              disabled={rename.isPending}
              className="h-8 min-w-0 flex-1 rounded-[4px] border border-[var(--border-strong)] bg-[var(--surface-bg)] px-2 text-sm font-normal outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            {rename.isPending ? (
              <LoaderCircle aria-label="正在保存" className="size-3.5 shrink-0 animate-spin" />
            ) : null}
          </div>
          {error ? (
            <p id={errorId} role="alert" className="mt-1 text-xs text-[var(--accent-hover)]">
              {error}
            </p>
          ) : null}
        </form>
      ) : (
        <div className="flex min-h-[50px] items-center pr-2">
          <button
            type="button"
            onClick={onSelect}
            aria-current={selected ? "page" : undefined}
            className="flex min-h-[50px] min-w-0 flex-1 items-center gap-[10px] rounded-[6px] pl-[13px] pr-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <MessageSquare className="size-[18px] shrink-0" />
            <span title={session.title} className="min-w-0 flex-1 truncate">
              {session.title}
            </span>
            {selected ? (
              <span aria-label="当前会话" className="size-[9px] shrink-0 bg-[var(--accent)]" />
            ) : indicator === "COMPLETED" ? (
              <CheckCircle2 aria-label="有新的生成结果" className="size-3.5 shrink-0 text-[var(--accent)]" />
            ) : indicator === "ATTENTION" ? (
              <span aria-label="生成失败" className="size-2 shrink-0 bg-[var(--accent-hover)]" />
            ) : null}
          </button>
          <Menu.Root>
            <Menu.Trigger disabled={remove.isPending} aria-label={`会话操作：${session.title}`} title="会话操作" className={iconButton}>
              {remove.isPending ? <LoaderCircle aria-label="正在删除" className="size-3.5 animate-spin" /> : <MoreHorizontal className="size-3.5" />}
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner sideOffset={6} align="end" className="z-[80] outline-none">
                <Menu.Popup
                  finalFocus={() => !editingRef.current}
                  className="min-w-32 overflow-hidden rounded-[7px] border border-[var(--border)] bg-[var(--surface-bg)] p-1 text-sm text-[var(--primary)] shadow-[0_12px_26px_var(--shadow)] outline-none"
                >
                  <Menu.Item
                    onClick={() => {
                      form.reset({ title: session.title });
                      rename.reset();
                      editingRef.current = true;
                      setEditing(true);
                    }}
                    className="flex cursor-default items-center gap-2 rounded-[5px] px-3 py-2 outline-none data-[highlighted]:bg-[var(--surface-hover)]"
                  >
                    <PencilLine className="size-4" />
                    重命名
                  </Menu.Item>
                  <Menu.Item
                    disabled={remove.isPending}
                    onClick={() => remove.mutate()}
                    className="flex cursor-default items-center gap-2 rounded-[5px] px-3 py-2 text-destructive outline-none data-[highlighted]:bg-[var(--surface-hover)] data-[disabled]:opacity-50"
                  >
                    <Trash2 className="size-4" />
                    删除
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
      )}
      {remove.isError ? (
        <p role="alert" className="px-3 pb-2 text-xs font-normal text-[var(--accent-hover)]">
          {getApiErrorMessage(remove.error) ?? "会话删除失败，请重试。"}
        </p>
      ) : null}
    </div>
  );
}
