"use client";

/* eslint-disable @next/next/no-img-element */
import { getPublicAuthor } from "@/features/public-user/api/public-user-api";
import { type ProfileFormValues } from "@/features/public-user/model/profile-form";
import { AccentSquare, DotMatrix } from "@/shared/ui/editorial-ornaments/editorial-ornaments";
import { LogOut, Pencil, Sparkles } from "lucide-react";
import { ProfileEditForm } from "./profile-edit-form";

type ProfileHeroProps = {
  author: Awaited<ReturnType<typeof getPublicAuthor>>;
  isSelf: boolean;
  editing: boolean;
  initialNickname: string;
  initialBio: string;
  saveError: string;
  isSaving: boolean;
  isFollowing: boolean;
  followLabel: string;
  likesPublic: boolean;
  isUpdatingVisibility: boolean;
  onFollow: () => void;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onSave: (values: ProfileFormValues) => void;
  onLogout: () => void;
  onVisibilityChange: (publicVisible: boolean) => void;
};

export function ProfileHero({
  author,
  isSelf,
  editing,
  initialNickname,
  initialBio,
  saveError,
  isSaving,
  isFollowing,
  followLabel,
  likesPublic,
  isUpdatingVisibility,
  onFollow,
  onStartEditing,
  onCancelEditing,
  onSave,
  onLogout,
  onVisibilityChange,
}: ProfileHeroProps) {
  return (
    <section className="relative min-h-[320px] overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--surface-bg)] px-6 py-8 shadow-[0_1px_2px_rgb(43_35_25_/_4%),0_8px_24px_rgb(43_35_25_/_5%)] sm:px-12 sm:py-[42px]">
      <HeroDecorations />
      <div className="relative z-10 flex min-h-[254px] flex-col">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-[var(--text-secondary)]">
          <span className="text-[var(--accent)]">01</span> / CREATOR PROFILE
        </p>
        <div className="mt-5 flex flex-1 flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="flex min-w-0 items-center gap-5 sm:gap-7">
            <Avatar author={author} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <h1 className="truncate text-3xl font-bold leading-[1.15] tracking-tight text-[var(--primary)] sm:text-[36px]">
                  {author.nickname}
                </h1>
                <span className="inline-flex h-[30px] items-center rounded-[6px] border border-[var(--accent-border-strong)] bg-[var(--accent-soft)] px-2.5 text-sm font-medium text-[var(--accent)]">
                  <Sparkles className="mr-1 size-3.5" />
                  创作者
                </span>
              </div>
              <p className="mt-3 max-w-xl whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
                {author.bio || "这个作者还没有简介。"}
              </p>
              <dl className="mt-5 flex flex-wrap items-center gap-y-3 text-sm text-[var(--text-secondary)]">
                <ProfileStat value={author.followerCount} label="关注者" />
                <ProfileStat value={author.followingCount} label="正在关注" />
                <ProfileStat value={author.receivedLikeCount} label="获赞" />
              </dl>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 self-end">
            {isSelf ? (
              <>
                <button
                  type="button"
                  onClick={onStartEditing}
                  className="inline-flex h-[46px] items-center gap-2 rounded-[7px] bg-[var(--primary)] px-5 text-sm font-semibold text-[var(--surface-bg)] transition-colors hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
                >
                  <Pencil className="size-4" />
                  编辑资料
                </button>
                <button
                  type="button"
                  onClick={onLogout}
                  className="inline-flex h-[46px] items-center gap-2 rounded-[7px] border border-[var(--text-secondary)] bg-[var(--surface-bg)] px-5 text-sm font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--page-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-secondary)] focus-visible:ring-offset-2"
                >
                  <LogOut className="size-4" />
                  退出登录
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onFollow}
                disabled={isFollowing}
                className="inline-flex h-[46px] items-center rounded-[7px] bg-[var(--primary)] px-7 text-sm font-semibold text-[var(--surface-bg)] transition-colors hover:bg-[var(--primary-hover)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
              >
                {followLabel}
              </button>
            )}
          </div>
        </div>
        {isSelf ? (
          <label className="mt-4 flex w-fit items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input
              aria-label="公开我的点赞列表"
              type="checkbox"
              checked={likesPublic}
              disabled={isUpdatingVisibility}
              onChange={(event) => onVisibilityChange(event.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            公开我的点赞列表
          </label>
        ) : null}
        {isSelf && editing ? (
          <ProfileEditForm
            nickname={initialNickname}
            bio={initialBio}
            error={saveError}
            saving={isSaving}
            onSave={onSave}
            onCancel={onCancelEditing}
          />
        ) : null}
      </div>
    </section>
  );
}

function HeroDecorations() {
  return (
    <>
      <div aria-hidden className="absolute right-0 top-0 h-[58%] w-[42%] bg-[var(--active-bg)]" />
      <div aria-hidden className="absolute bottom-0 right-0 h-[42%] w-[35%] bg-[var(--peach)]/45" />
      <AccentSquare size={22} className="absolute right-6 top-4" />
      <DotMatrix
        columns={5}
        rows={3}
        dotSize={3}
        gap={4}
        color="var(--accent)"
        opacity={0.25}
        className="absolute left-12 top-4"
      />
      <div aria-hidden className="absolute inset-x-10 bottom-6 h-px bg-[var(--border-strong)]" />
    </>
  );
}

function Avatar({ author }: { author: Awaited<ReturnType<typeof getPublicAuthor>> }) {
  const initial = author.nickname.trim().slice(0, 1).toUpperCase() || "我";
  return (
    <div className="grid size-28 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--avatar-border)] bg-[var(--surface-bg)] sm:size-[164px]">
      {author.avatarUrl ? (
        <img src={author.avatarUrl} alt={`${author.nickname}的头像`} className="size-full object-cover" />
      ) : (
        <span className="grid size-14 place-items-center rounded-[7px] bg-[var(--accent)] text-2xl font-semibold text-[var(--surface-bg)] sm:size-[62px] sm:text-[28px]">
          {initial}
        </span>
      )}
    </div>
  );
}

function ProfileStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-2 border-l border-[var(--border)] pl-5 first:border-l-0 first:pl-0 sm:pr-3">
      <dd className="text-lg font-semibold text-[var(--primary)]">{value}</dd>
      <dt>{label}</dt>
    </div>
  );
}
