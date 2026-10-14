"use client";

import type { GenerationAsset } from "@/entities/image-resource/model/image-resource";
import { type PublicAuthor } from "@/features/public-user/api/public-user-api";
import { Menu } from "@base-ui/react/menu";
import { Download, Heart, LoaderCircle, MoreHorizontal, Trash2 } from "lucide-react";
import { AuthorCard } from "./public-author-card";

export function PublicDetailHeader({
  image,
  author,
  authorLoading,
  isSelf,
  following,
  liking,
  downloading,
  withdrawing,
  likeError,
  downloadError,
  withdrawError,
  onFollow,
  onLike,
  onDownload,
  onWithdraw,
}: {
  image: GenerationAsset;
  author: PublicAuthor | undefined;
  authorLoading: boolean;
  isSelf: boolean;
  following: boolean;
  liking: boolean;
  downloading: boolean;
  withdrawing: boolean;
  likeError: string | null;
  downloadError: boolean;
  withdrawError: boolean;
  onFollow: () => void;
  onLike: () => void;
  onDownload: () => void;
  onWithdraw: () => void;
}) {
  const likeLabel = `${image.likedByCurrentUser ? "取消点赞" : "点赞"}，当前 ${image.likeCount} 个赞`;
  const errorMessage =
    likeError ?? (downloadError ? "下载失败，请稍后重试。" : withdrawError ? "撤销发布失败，请稍后重试。" : null);

  return (
    <section className="border-b border-[var(--border)] pb-5">
      <div className="flex min-w-0 items-center gap-3">
        <AuthorCard author={author} loading={authorLoading} isSelf={isSelf} following={following} onFollow={onFollow} />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={likeLabel}
            aria-pressed={image.likedByCurrentUser}
            disabled={liking}
            onClick={onLike}
            className="inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-[6px] px-2 text-sm font-medium text-[var(--primary)] transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Heart
              className={`size-[18px] ${image.likedByCurrentUser ? "fill-[var(--accent)] text-[var(--accent)]" : ""}`}
            />
            <span>{image.likeCount}</span>
          </button>
          <Menu.Root>
            <Menu.Trigger
              aria-label="更多操作"
              className="grid size-9 place-items-center rounded-[6px] text-[var(--primary)] transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <MoreHorizontal className="size-5" />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner sideOffset={6} align="end" className="z-[80] outline-none">
                <Menu.Popup className="min-w-36 overflow-hidden rounded-[7px] border border-[var(--border)] bg-[var(--surface-bg)] p-1 text-sm text-[var(--primary)] shadow-[0_12px_26px_var(--shadow)] outline-none">
                  <Menu.Item
                    disabled={downloading}
                    onClick={onDownload}
                    className="flex cursor-default items-center gap-2 rounded-[5px] px-3 py-2 outline-none data-[highlighted]:bg-[var(--surface-hover)] data-[disabled]:opacity-50"
                  >
                    {downloading ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
                    下载
                  </Menu.Item>
                  {isSelf ? (
                    <>
                      <Menu.Separator className="my-1 h-px bg-[var(--border)]" />
                      <Menu.Item
                        disabled={withdrawing}
                        onClick={onWithdraw}
                        className="flex cursor-default items-center gap-2 rounded-[5px] px-3 py-2 text-destructive outline-none data-[highlighted]:bg-destructive/10 data-[disabled]:opacity-50"
                      >
                        {withdrawing ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                        撤销发布
                      </Menu.Item>
                    </>
                  ) : null}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
        <time dateTime={image.publicAt ?? undefined}>{publicDateText(image.publicAt)}</time>
        <span aria-hidden="true" className="h-3 w-px bg-[var(--border-strong)]" />
        <span>
          内容由 <span className="text-[var(--accent)]">AI</span> 生成
        </span>
      </div>
      {errorMessage ? (
        <p role="status" className="mt-3 text-xs text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}

function publicDateText(value: string | null): string {
  if (!value) return "—";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
