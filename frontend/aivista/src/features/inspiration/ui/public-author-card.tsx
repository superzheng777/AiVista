"use client";

/* eslint-disable @next/next/no-img-element */

import { type PublicAuthor } from "@/features/public-user/api/public-user-api";
import { Plus } from "lucide-react";
import Link from "next/link";

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
