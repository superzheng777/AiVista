"use client";
/* eslint-disable @next/next/no-img-element */

import { Menu } from "@base-ui/react/menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Heart, LoaderCircle, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import type { ImageDetailNavigation } from "@/entities/generation/model/use-image-detail-navigation";
import { ImageDetailShell } from "@/entities/generation/ui/image-detail-shell";
import { downloadOriginalGenerationImage } from "@/features/assets/lib/original-image-download";
import { useAuthDialog } from "@/features/auth/model/auth-dialog-provider";
import { useSession } from "@/features/auth/model/session-provider";
import { getInspiration, inspirationQueryKeys, setImageLike } from "@/features/inspiration/api/inspiration-api";
import { downloadPublicDisplayImage } from "@/features/inspiration/lib/public-image-download";
import { updateInspirationInFeeds } from "@/features/inspiration/model/inspiration-cache";
import { publicationQueryKeys, removePublication } from "@/features/publication/api/publication-api";
import { getPublicAuthor, setFollowing, type PublicAuthor } from "@/features/public-user/api/public-user-api";

export function PublicImageDetail({
  image,
  onClose,
  onImageChange,
  navigation,
}: {
  image: GenerationAsset;
  onClose: () => void;
  onImageChange: (image: GenerationAsset) => void;
  navigation?: ImageDetailNavigation;
}) {
  const { status, user } = useSession();
  const { open } = useAuthDialog();
  const queryClient = useQueryClient();
  const [likeError, setLikeError] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const isSelf = user?.id === image.authorId;
  const author = useQuery({
    queryKey: ["public-author", image.authorId],
    queryFn: () => getPublicAuthor(image.authorId),
    enabled: Boolean(image.authorId),
  });
  const like = useMutation({ mutationFn: (liked: boolean) => setImageLike(image.id, image.publicationVersion, liked) });
  const follow = useMutation({
    mutationFn: (following: boolean) => setFollowing(image.authorId, following),
    onSuccess: () => {
      void author.refetch();
      void queryClient.invalidateQueries({ queryKey: inspirationQueryKeys.following });
    },
  });
  const withdraw = useMutation({
    mutationFn: () => removePublication(image.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inspirationQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: publicationQueryKeys.mine });
      onClose();
    },
  });

  async function refreshImage(imageId: string): Promise<GenerationAsset> {
    const refreshed = await getInspiration(imageId);
    onImageChange(refreshed);
    updateInspirationInFeeds(queryClient, refreshed);
    return refreshed;
  }

  const requireLogin = (action: () => void) => {
    if (status !== "authenticated") open();
    else action();
  };

  function toggleLike(): void {
    const previous = image;
    const liked = !previous.likedByCurrentUser;
    const next = {
      ...previous,
      likedByCurrentUser: liked,
      likeCount: Math.max(0, previous.likeCount + (liked ? 1 : -1)),
    };
    setLikeError(false);
    onImageChange(next);
    updateInspirationInFeeds(queryClient, next);
    like.mutate(liked, {
      onError: () => {
        onImageChange(previous);
        setLikeError(true);
        updateInspirationInFeeds(queryClient, previous);
      },
    });
  }

  const download = useMutation({
    mutationFn: async () => {
      setDownloadError(false);
      if (isSelf) await downloadOriginalGenerationImage(image);
      else await downloadPublicDisplayImage(image, refreshImage);
    },
    onError: () => setDownloadError(true),
  });

  return (
    <ImageDetailShell
      image={image}
      refreshImage={refreshImage}
      onClose={onClose}
      navigation={navigation}
      showTimeInInfo={false}
      author={
        <PublicDetailHeader
          image={image}
          author={author.data}
          authorLoading={author.isLoading}
          isSelf={isSelf}
          following={follow.isPending}
          liking={like.isPending}
          downloading={download.isPending}
          withdrawing={withdraw.isPending}
          likeError={likeError}
          downloadError={downloadError}
          withdrawError={withdraw.isError}
          onFollow={() => requireLogin(() => follow.mutate(!(author.data?.viewerFollowing ?? false)))}
          onLike={() => requireLogin(toggleLike)}
          onDownload={() => download.mutate()}
          onWithdraw={() => withdraw.mutate()}
        />
      }
    />
  );
}

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
  likeError: boolean;
  downloadError: boolean;
  withdrawError: boolean;
  onFollow: () => void;
  onLike: () => void;
  onDownload: () => void;
  onWithdraw: () => void;
}) {
  const likeLabel = `${image.likedByCurrentUser ? "取消点赞" : "点赞"}，当前 ${image.likeCount} 个赞`;
  const errorMessage = likeError
    ? "点赞状态更新失败，已恢复原状态。"
    : downloadError
      ? "下载失败，请稍后重试。"
      : withdrawError
        ? "撤销发布失败，请稍后重试。"
        : null;

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

export function AuthorCard({
  author,
  loading,
  isSelf,
  onFollow,
  following,
}: {
  author: PublicAuthor | undefined;
  loading: boolean;
  isSelf: boolean;
  onFollow: () => void;
  following: boolean;
}) {
  if (loading) return <div className="h-10 min-w-36 flex-1 animate-pulse rounded-[7px] bg-[var(--skeleton)]" />;
  if (!author) return <div className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">作者信息不可用</div>;

  const label = author.viewerFollowing
    ? author.viewerFollowedByAuthor
      ? "互相关注"
      : "已关注"
    : author.viewerFollowedByAuthor
      ? "回关"
      : "关注";
  const profileHref = `/users?userId=${encodeURIComponent(author.id)}`;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <Link
        href={profileHref}
        aria-label={`${author.nickname}的主页`}
        className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--active-bg)] text-sm font-semibold text-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        {author.avatarUrl ? (
          <img src={author.avatarUrl} alt={`${author.nickname}的头像`} className="size-full object-cover" />
        ) : (
          author.nickname.slice(0, 1)
        )}
      </Link>
      <Link
        href={profileHref}
        className="min-w-0 truncate text-sm font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        {author.nickname}
      </Link>
      {!isSelf ? (
        <button
          type="button"
          onClick={onFollow}
          disabled={following}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-[6px] bg-[var(--surface-soft)] px-2.5 text-xs font-medium text-[var(--primary)] transition hover:bg-[var(--active-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {!author.viewerFollowing ? <Plus className="size-3.5" /> : null}
          {label}
        </button>
      ) : null}
    </div>
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
