"use client";

import { type GenerationAsset } from "@/entities/image-resource/model/image-resource";
import { Sparkles } from "lucide-react";
import { WorkGrid } from "./profile-work-grid";

export function WorksPanel({
  isSelf,
  images,
  loading,
  error,
  openingId,
  onOpen,
  onRetry,
  onStartCreating,
}: {
  isSelf: boolean;
  images: GenerationAsset[];
  loading: boolean;
  error: boolean;
  openingId: string | null;
  onOpen: (image: GenerationAsset) => void | Promise<void>;
  onRetry: () => void;
  onStartCreating: () => void;
}) {
  if (loading) return <WorkGridSkeleton />;
  if (error) return <PanelError message="作品加载失败，请重试。" onRetry={onRetry} />;
  if (!images.length)
    return (
      <ProfileEmptyState
        isSelf={isSelf}
        title={isSelf ? "这里还没有作品" : "这里还没有公开作品"}
        description={isSelf ? "把一次灵感变成你的第一件作品" : "这个创作者还没有公开作品"}
        onStartCreating={onStartCreating}
      />
    );
  return <WorkGrid images={images} openingId={openingId} onOpen={onOpen} />;
}

export function LikesPanel({
  images,
  loading,
  error,
  onOpen,
  onRetry,
}: {
  images: GenerationAsset[];
  loading: boolean;
  error: boolean;
  onOpen: (image: GenerationAsset) => void | Promise<void>;
  onRetry: () => void;
}) {
  if (loading) return <WorkGridSkeleton />;
  if (error) return <PanelError message="点赞作品加载失败，请重试。" onRetry={onRetry} />;
  if (!images.length)
    return <ProfileEmptyState isSelf={false} title="这里还没有点赞作品" description="喜欢的作品会出现在这里" />;
  return <WorkGrid images={images} openingId={null} onOpen={onOpen} />;
}

function WorkGridSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="aspect-square animate-pulse rounded-[10px] bg-[var(--skeleton-dark)]" />
      ))}
    </div>
  );
}

function ProfileEmptyState({
  isSelf,
  title,
  description,
  onStartCreating,
}: {
  isSelf: boolean;
  title: string;
  description: string;
  onStartCreating?: () => void;
}) {
  return (
    <div className="flex min-h-[400px] flex-1 items-start justify-center pt-16 text-center">
      <div className="max-w-[440px]">
        <EmptyGeometry />
        <h2 className="mt-5 text-2xl font-bold leading-[1.25] text-[var(--primary)] sm:text-[28px]">{title}</h2>
        <p className="mt-3 text-[15px] leading-7 text-[var(--text-secondary)]">{description}</p>
        {isSelf && onStartCreating ? (
          <button
            type="button"
            onClick={onStartCreating}
            className="mt-6 inline-flex h-[46px] min-w-[184px] items-center justify-center gap-2 rounded-[7px] bg-[var(--primary)] px-6 text-sm font-semibold text-[var(--surface-bg)] transition-colors hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
          >
            <Sparkles className="size-4" />
            开始创作
          </button>
        ) : null}
      </div>
    </div>
  );
}

function EmptyGeometry() {
  return (
    <div aria-hidden className="relative mx-auto h-[86px] w-[124px]">
      <span className="absolute left-1 top-0 h-[54px] w-[74px] border border-[var(--text-secondary)]" />
      <span className="absolute left-[39px] top-[18px] h-[54px] w-[74px] border border-[var(--text-secondary)]" />
      <span className="absolute bottom-0 left-0 size-[10px] bg-[var(--accent)]" />
      <Sparkles className="absolute right-0 top-[-7px] size-[14px] text-[var(--primary)]" />
    </div>
  );
}

function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="grid min-h-[400px] place-items-center text-center">
      <div>
        <p className="text-sm text-[var(--accent)]">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 text-sm font-medium text-[var(--accent)] underline underline-offset-4"
        >
          重新加载
        </button>
      </div>
    </div>
  );
}
