"use client";
/* eslint-disable @next/next/no-img-element */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, Heart, LoaderCircle, MoreHorizontal, Send, Sparkles, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { needsImageUrlRefresh, type GenerationAsset } from "@/entities/generation/model/generation";
import {
  useImageDetailNavigation,
  type ImageDetailNavigation,
} from "@/entities/generation/model/use-image-detail-navigation";
import { ImageDetailShell } from "@/entities/generation/ui/image-detail-shell";
import {
  assetQueryKeys,
  deleteGenerationAssets,
  getGenerationAsset,
  listGenerationAssets,
  setGenerationImageFavorites,
} from "@/features/assets/api/asset-api";
import { downloadOriginalGenerationImage } from "@/features/assets/lib/original-image-download";
import { useGenerationEventStream } from "@/features/generation/model/generation-event-stream-provider";
import { PublicationFormDialog } from "@/features/publication/ui/publication-form-dialog";
import { cn } from "@/shared/lib/cn";
import { AccentSquare, DotMatrix } from "@/shared/ui/editorial-ornaments/editorial-ornaments";

const EMPTY_ASSETS: GenerationAsset[] = [];
const ASSET_GRID_CLASS =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6 lg:gap-3 min-[1320px]:gap-[18px]";
const day = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "long",
  day: "numeric",
});
const weekday = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", weekday: "long" });
function groupsOf(assets: GenerationAsset[]) {
  const groups = new Map<string, { key: string; label: string; weekday: string; items: GenerationAsset[] }>();
  for (const asset of assets) {
    const date = new Date(asset.createdAt);
    const key = date.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
    const group = groups.get(key) ?? { key, label: day.format(date), weekday: weekday.format(date), items: [] };
    group.items.push(asset);
    groups.set(key, group);
  }
  return [...groups.values()];
}
function titleOf(asset: GenerationAsset) {
  return asset.title?.trim() || "未命名作品";
}
function statusOf(asset: GenerationAsset) {
  return asset.publicationReviewStatus === "APPROVED"
    ? "已发布"
    : asset.publicationReviewStatus === "PENDING"
      ? "审核中"
      : asset.publicationReviewStatus === "REJECTED"
        ? "未通过"
        : null;
}

export function AssetsWorkspace() {
  const client = useQueryClient();
  const { hasCompletedResults, acknowledgeCompletedResults } = useGenerationEventStream();
  const acknowledgedAt = useRef(0);
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string[] | null>(null);
  const [publishing, setPublishing] = useState<GenerationAsset | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const query = useQuery({ queryKey: assetQueryKeys.all, queryFn: listGenerationAssets });
  const assets = query.data ?? EMPTY_ASSETS;
  const detail = detailId ? (assets.find((asset) => asset.id === detailId) ?? null) : null;
  const groups = useMemo(() => groupsOf(assets), [assets]);
  const selectedAssets = assets.filter((asset) => selected.has(asset.id));
  useEffect(() => {
    if (query.dataUpdatedAt && query.dataUpdatedAt > acknowledgedAt.current) {
      acknowledgedAt.current = query.dataUpdatedAt;
      if (hasCompletedResults) acknowledgeCompletedResults();
    }
  }, [acknowledgeCompletedResults, hasCompletedResults, query.dataUpdatedAt]);
  const remove = useMutation({
    mutationFn: deleteGenerationAssets,
    onMutate: async (ids) => {
      await client.cancelQueries({ queryKey: assetQueryKeys.all });
      const previous = client.getQueryData<GenerationAsset[]>(assetQueryKeys.all);
      client.setQueryData<GenerationAsset[]>(assetQueryKeys.all, (current) =>
        current?.filter((asset) => !ids.includes(asset.id)),
      );
      return { previous };
    },
    onSuccess: (_result, ids) => {
      setSelected((current) => new Set([...current].filter((id) => !ids.includes(id))));
      setDetailId((id) => (id && ids.includes(id) ? null : id));
      setNotice(`已删除 ${ids.length} 张图片`);
    },
    onError: (_error, _ids, context) => {
      client.setQueryData(assetQueryKeys.all, context?.previous);
      setNotice("删除失败，请重试。");
    },
    onSettled: () => setDeleting(null),
  });
  const favorite = useMutation({
    mutationFn: ({ ids, value }: { ids: string[]; value: boolean }) => setGenerationImageFavorites(ids, value),
    onMutate: async ({ ids, value }) => {
      await client.cancelQueries({ queryKey: assetQueryKeys.all });
      const previous = client.getQueryData<GenerationAsset[]>(assetQueryKeys.all);
      client.setQueryData<GenerationAsset[]>(assetQueryKeys.all, (current) =>
        current?.map((asset) => (ids.includes(asset.id) ? { ...asset, favorited: value } : asset)),
      );
      return { previous };
    },
    onSuccess: (_result, { value }) => setNotice(value ? "已收藏图片" : "已取消收藏"),
    onError: (_error, _data, context) => {
      client.setQueryData(assetQueryKeys.all, context?.previous);
      setNotice("收藏状态更新失败，请重试。");
    },
    onSettled: () => void client.invalidateQueries({ queryKey: assetQueryKeys.all }),
  });
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const leaveManaging = () => {
    setManaging(false);
    setSelected(new Set());
  };
  async function refresh(id: string) {
    const result = await getGenerationAsset(id);
    client.setQueryData<GenerationAsset[]>(assetQueryKeys.all, (current) =>
      current?.map((asset) => (asset.id === id ? result : asset)),
    );
    return result;
  }
  async function open(asset: GenerationAsset) {
    if (!needsImageUrlRefresh(asset.imageUrls.display)) return setDetailId(asset.id);
    setOpeningId(asset.id);
    try {
      await refresh(asset.id);
      setDetailId(asset.id);
    } catch {
      setNotice("图片访问地址刷新失败，请稍后重试。");
    } finally {
      setOpeningId(null);
    }
  }
  async function download(asset: GenerationAsset) {
    try {
      await downloadOriginalGenerationImage(asset);
    } catch {
      setNotice("下载失败，请稍后重试。");
    }
  }
  function publish(asset: GenerationAsset) {
    if (asset.publicationReviewStatus === "APPROVED") {
      window.location.assign(`/inspirations?imageId=${encodeURIComponent(asset.id)}`);
      return;
    }
    if (asset.publicationReviewStatus === "PENDING") return setNotice("该图片正在审核中。");
    setPublishing(asset);
  }
  const detailNavigation = useImageDetailNavigation({ items: assets, currentImageId: detailId, onSelect: open });
  if (detail)
    return (
      <>
        {notice ? (
          <p
            role="status"
            className="m-4 rounded-[7px] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--accent-hover)]"
          >
            {notice}
          </p>
        ) : null}
        <AssetDetail
          asset={detail}
          refreshImage={refresh}
          navigation={detailNavigation}
          onClose={() => setDetailId(null)}
          onPublish={() => publish(detail)}
          onDelete={() => setDeleting([detail.id])}
          isDeleting={remove.isPending}
          isFavorite={detail.favorited}
          isFavoriteUpdating={favorite.isPending}
          onFavorite={() => favorite.mutate({ ids: [detail.id], value: !detail.favorited })}
          deleteDialog={
            deleting ? (
              <DeleteDialog
                count={deleting.length}
                isDeleting={remove.isPending}
                onCancel={() => setDeleting(null)}
                onConfirm={() => remove.mutate(deleting)}
              />
            ) : null
          }
          publishDialog={
            publishing ? (
              <PublicationFormDialog
                asset={publishing}
                onClose={() => setPublishing(null)}
                onSuccess={(result) => {
                  setPublishing(null);
                  client.setQueryData<GenerationAsset[]>(assetQueryKeys.all, (current) =>
                    current?.map((asset) =>
                      asset.id === result.imageId ? { ...asset, publicationReviewStatus: result.status } : asset,
                    ),
                  );
                  void client.invalidateQueries({ queryKey: assetQueryKeys.all });
                  setNotice("图片已发布，正在审核。");
                }}
              />
            ) : null
          }
        />
      </>
    );
  return (
    <section className="min-h-dvh bg-[var(--page-bg)] px-4 py-7 text-[var(--primary)] sm:px-8 sm:py-9 lg:px-12 lg:py-[38px]">
      <div className="mx-auto w-full max-w-[1640px]">
        <header className="relative flex min-h-[172px] flex-col justify-between gap-7 sm:flex-row sm:items-start">
          <div>
            <p className="text-[11px] font-semibold leading-none tracking-[0.16em] text-[var(--text-secondary)]">
              <span className="text-[var(--accent)]">03</span> / PERSONAL ASSETS
            </p>
            <h1 className="mt-4 text-[32px] font-bold leading-[1.2] tracking-tight sm:text-4xl">你的创作</h1>
            <p className="mt-7 text-sm text-[var(--text-secondary)]">共 {assets.length} 项资产</p>
          </div>
          <div className="relative z-10 flex shrink-0 items-start gap-8 sm:mt-[7px]">
            <div
              aria-hidden="true"
              className="pointer-events-none relative mt-1 hidden h-[52px] w-[82px] shrink-0 lg:block"
            >
              <DotMatrix columns={5} rows={3} dotSize={3} gap={7} className="absolute left-0 top-0" />
              <AccentSquare size={14} className="absolute bottom-0 right-0" />
            </div>
            <div className="flex gap-4">
              {!managing ? (
                <button
                  type="button"
                  onClick={() => setManaging(true)}
                  className="inline-flex h-[52px] items-center rounded-[7px] border border-[var(--border)] bg-[var(--surface-bg)] px-6 text-[15px] font-semibold hover:bg-[var(--surface-soft)]"
                >
                  批量操作
                </button>
              ) : null}
              <Link
                href="/generate"
                className="inline-flex h-[52px] items-center gap-2 rounded-[7px] bg-[var(--accent)] px-[26px] text-[15px] font-semibold text-[var(--surface-bg)] hover:bg-[var(--accent-hover)]"
              >
                <Sparkles className="size-4" />
                开始创作
              </Link>
            </div>
          </div>
        </header>
        {notice ? (
          <div
            role="status"
            className="mb-7 flex items-center justify-between rounded-[7px] border border-[var(--border)] bg-[var(--surface-bg)] px-4 py-3 text-sm text-[var(--text-secondary)]"
          >
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="p-1" aria-label="关闭提示">
              <X className="size-4" />
            </button>
          </div>
        ) : null}
        {query.isLoading ? <AssetSkeleton /> : null}
        {query.isError ? (
          <section
            role="alert"
            className="mt-10 border border-[var(--accent-border)] bg-[var(--surface-bg)] px-6 py-12 text-center"
          >
            <p className="text-sm text-[var(--accent-hover)]">资产加载失败，请重试。</p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="mt-3 text-sm font-semibold underline underline-offset-4"
            >
              重新加载
            </button>
          </section>
        ) : null}
        {!query.isLoading && !query.isError && !assets.length ? <EmptyAssets /> : null}
        <div className="space-y-12">
          {groups.map((group) => (
            <section key={group.key}>
              <div className="mb-[18px] flex items-center">
                <h2 className="shrink-0 whitespace-nowrap text-[21px] font-bold tracking-tight sm:text-[26px]">
                  {group.label}
                </h2>
                <p className="ml-5 shrink-0 whitespace-nowrap text-sm text-[var(--text-secondary)] sm:ml-[38px]">
                  {group.weekday} · {group.items.length} 项
                </p>
                <span className="ml-4 h-px flex-1 bg-[var(--border)] sm:ml-[22px]" />
                <span className="ml-3 size-[10px] shrink-0 bg-[var(--accent)] sm:ml-5" />
              </div>
              <div className={ASSET_GRID_CLASS}>
                {group.items.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    managing={managing}
                    selected={selected.has(asset.id)}
                    opening={openingId === asset.id}
                    favoriteUpdating={favorite.isPending}
                    onOpen={() => void open(asset)}
                    onSelect={() => toggle(asset.id)}
                    onBeginManaging={() => {
                      setManaging(true);
                      setSelected((current) => new Set([...current, asset.id]));
                    }}
                    onFavorite={() => favorite.mutate({ ids: [asset.id], value: !asset.favorited })}
                    onDownload={() => void download(asset)}
                    onPublish={() => publish(asset)}
                    onDelete={() => setDeleting([asset.id])}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      {managing ? (
        <BulkBar
          count={selectedAssets.length}
          hasUnfavorited={selectedAssets.some((asset) => !asset.favorited)}
          favoriteUpdating={favorite.isPending}
          deleting={remove.isPending}
          onCancel={leaveManaging}
          onDownload={() => {
            void Promise.all(selectedAssets.map(download));
          }}
          onFavorite={() =>
            favorite.mutate({
              ids: selectedAssets.map((asset) => asset.id),
              value: selectedAssets.some((asset) => !asset.favorited),
            })
          }
          onDelete={() => setDeleting([...selected])}
        />
      ) : null}
      {deleting ? (
        <DeleteDialog
          count={deleting.length}
          isDeleting={remove.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => remove.mutate(deleting)}
        />
      ) : null}
      {publishing ? (
        <PublicationFormDialog
          asset={publishing}
          onClose={() => setPublishing(null)}
          onSuccess={() => {
            setPublishing(null);
            void client.invalidateQueries({ queryKey: assetQueryKeys.all });
            setNotice("图片已发布，正在审核。");
          }}
        />
      ) : null}
    </section>
  );
}

function AssetCard({
  asset,
  managing,
  selected,
  opening,
  favoriteUpdating,
  onOpen,
  onSelect,
  onBeginManaging,
  onFavorite,
  onDownload,
  onPublish,
  onDelete,
}: {
  asset: GenerationAsset;
  managing: boolean;
  selected: boolean;
  opening: boolean;
  favoriteUpdating: boolean;
  onOpen: () => void;
  onSelect: () => void;
  onBeginManaging: () => void;
  onFavorite: () => void;
  onDownload: () => void;
  onPublish: () => void;
  onDelete: () => void;
}) {
  const [more, setMore] = useState(false);
  const status = statusOf(asset);
  const publishLabel = asset.publicationReviewStatus === "APPROVED" ? "查看发布" : "发布";
  return (
    <article className="min-w-0">
      <div
        className={cn(
          "group relative aspect-square overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface-bg)] transition duration-150 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgb(43_35_25_/_4%),0_12px_26px_rgb(43_35_25_/_8%)]",
          selected && "shadow-[inset_0_0_0_2px_var(--accent)]",
        )}
      >
        <button
          type="button"
          disabled={opening}
          onClick={managing ? onSelect : onOpen}
          className="block size-full text-left disabled:opacity-60"
        >
          {asset.imageUrls.thumbnail ? (
            <img
              src={asset.imageUrls.thumbnail.url}
              alt={titleOf(asset)}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="size-full object-cover"
            />
          ) : (
            <div className="grid size-full place-items-center bg-[var(--surface-soft)] text-xs text-[var(--text-secondary)]">
              图片不可用
            </div>
          )}
        </button>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[var(--primary)]/[0.28] opacity-0 transition-opacity group-hover:opacity-100"
        />
        {status ? (
          <span
            className={cn(
              "pointer-events-none absolute right-3 top-3 z-10 rounded-[5px] px-2 py-1 text-xs font-medium transition-opacity group-hover:opacity-0 group-focus-within:opacity-0 lg:right-2 lg:top-2 min-[1320px]:right-3 min-[1320px]:top-3",
              asset.publicationReviewStatus === "APPROVED"
                ? "bg-[var(--active-bg)] text-[var(--accent)]"
                : "bg-[var(--surface-bg)] text-[var(--text-secondary)]",
            )}
          >
            {status}
          </span>
        ) : null}
        <button
          type="button"
          onClick={managing ? onSelect : onBeginManaging}
          className={cn(
            "absolute left-3 top-3 z-10 grid size-8 place-items-center rounded-[6px] border border-[var(--border)] bg-[var(--surface-bg)] text-[var(--primary)] transition lg:left-2 lg:top-2 min-[1320px]:left-3 min-[1320px]:top-3",
            managing ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100",
          )}
          aria-label={selected ? "取消选择图片" : "选择图片"}
        >
          <Check className={cn("size-4", selected ? "opacity-100" : "opacity-0")} />
        </button>
        <div className="absolute right-3 top-3 z-10 flex gap-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 lg:right-2 lg:top-2 lg:gap-1 min-[1320px]:right-3 min-[1320px]:top-3 min-[1320px]:gap-2">
          <button
            type="button"
            disabled={favoriteUpdating}
            onClick={onFavorite}
            className="grid size-9 place-items-center rounded-[6px] bg-[var(--primary)]/90 text-[var(--surface-bg)] lg:size-8 min-[1320px]:size-9"
            aria-label={asset.favorited ? "取消收藏" : "收藏"}
          >
            <Heart className={cn("size-4", asset.favorited && "fill-current text-[var(--active-bg)]")} />
          </button>
          <button
            type="button"
            onClick={() => setMore((value) => !value)}
            className="grid size-9 place-items-center rounded-[6px] bg-[var(--primary)]/90 text-[var(--surface-bg)] lg:size-8 min-[1320px]:size-9"
            aria-label="更多操作"
          >
            <MoreHorizontal className="size-5" />
          </button>
          {more ? (
            <div className="absolute right-0 top-11 w-28 overflow-hidden rounded-[6px] border border-[var(--border)] bg-[var(--surface-bg)] py-1 text-[var(--primary)] shadow-xl">
              <button
                type="button"
                onClick={() => {
                  setMore(false);
                  onOpen();
                }}
                className="w-full px-3 py-2 text-left text-xs hover:bg-[var(--surface-soft)]"
              >
                查看详情
              </button>
              <button
                type="button"
                onClick={() => {
                  setMore(false);
                  onDelete();
                }}
                className="w-full px-3 py-2 text-left text-xs text-[var(--accent-hover)] hover:bg-[var(--accent-soft)]"
              >
                删除
              </button>
            </div>
          ) : null}
        </div>
        <div className="absolute inset-x-3 bottom-3 z-10 flex justify-center gap-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 lg:inset-x-2 lg:bottom-2 lg:gap-1 min-[1320px]:inset-x-3 min-[1320px]:bottom-3 min-[1320px]:gap-2">
          <button
            type="button"
            title="下载"
            aria-label="下载图片"
            onClick={onDownload}
            className="inline-flex h-[38px] items-center gap-1.5 rounded-[6px] bg-[var(--primary)]/90 px-3 text-xs font-medium text-[var(--surface-bg)] lg:size-8 lg:justify-center lg:px-0 min-[1320px]:h-[38px] min-[1320px]:w-auto min-[1320px]:px-3"
          >
            <Download className="size-4" />
            <span className="lg:hidden min-[1320px]:inline">下载</span>
          </button>
          <button
            type="button"
            title={publishLabel}
            aria-label={publishLabel}
            onClick={onPublish}
            className="inline-flex h-[38px] items-center gap-1.5 rounded-[6px] bg-[var(--primary)]/90 px-3 text-xs font-medium text-[var(--surface-bg)] lg:size-8 lg:justify-center lg:px-0 min-[1320px]:h-[38px] min-[1320px]:w-auto min-[1320px]:px-3"
          >
            <Send className="size-4" />
            <span className="lg:hidden min-[1320px]:inline">{publishLabel}</span>
          </button>
        </div>
      </div>
    </article>
  );
}

function BulkBar({
  count,
  hasUnfavorited,
  favoriteUpdating,
  deleting,
  onCancel,
  onDownload,
  onFavorite,
  onDelete,
}: {
  count: number;
  hasUnfavorited: boolean;
  favoriteUpdating: boolean;
  deleting: boolean;
  onCancel: () => void;
  onDownload: () => void;
  onFavorite: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="fixed bottom-6 left-[calc(50%+44px)] z-30 flex h-16 w-[calc(100%-32px)] max-w-[760px] -translate-x-1/2 items-center gap-2 rounded-[10px] bg-[var(--primary)] px-4 text-[var(--surface-bg)] shadow-[0_12px_26px_rgb(43_35_25_/_20%)] sm:w-[calc(100%-120px)] sm:px-5">
      <span className="mr-auto text-sm">已选择 {count} 项</span>
      <button type="button" onClick={onCancel} className="h-10 rounded-[6px] px-3 text-sm hover:bg-white/10">
        取消选择
      </button>
      <button
        type="button"
        onClick={onDownload}
        disabled={!count}
        className="inline-flex h-10 items-center gap-1.5 rounded-[6px] bg-white/10 px-3 text-sm disabled:opacity-40"
      >
        <Download className="size-4" />
        下载
      </button>
      <button
        type="button"
        onClick={onFavorite}
        disabled={!count || favoriteUpdating}
        className="inline-flex h-10 items-center gap-1.5 rounded-[6px] bg-white/10 px-3 text-sm disabled:opacity-40"
      >
        <Heart className="size-4" />
        {hasUnfavorited ? "收藏" : "取消收藏"}
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={!count || deleting}
        className="inline-flex h-10 items-center gap-1.5 rounded-[6px] bg-[var(--accent)] px-3 text-sm disabled:opacity-40"
      >
        <Trash2 className="size-4" />
        删除
      </button>
    </div>
  );
}

export function AssetDetail({
  asset,
  refreshImage,
  navigation,
  onPublish,
  onClose,
  onDelete,
  isDeleting,
  isFavorite,
  isFavoriteUpdating,
  onFavorite,
  deleteDialog,
  publishDialog,
}: {
  asset: GenerationAsset;
  refreshImage?: (imageId: string) => Promise<GenerationAsset>;
  navigation?: ImageDetailNavigation;
  onPublish: () => void;
  onClose: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  isFavorite: boolean;
  isFavoriteUpdating: boolean;
  onFavorite: () => void;
  deleteDialog: React.ReactNode;
  publishDialog: React.ReactNode;
}) {
  return (
    <>
      <ImageDetailShell
        image={asset}
        refreshImage={refreshImage}
        navigation={navigation}
        onClose={onClose}
        onDownload={() => downloadOriginalGenerationImage(asset)}
        allowCopy={asset.publicationReviewStatus === "NONE"}
        actions={
          <section>
            <p className="text-xs font-medium tracking-wide text-muted-foreground">作品操作</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed={isFavorite}
                onClick={onFavorite}
                disabled={isFavoriteUpdating}
                className={cn(
                  "inline-flex h-10 items-center justify-center gap-2 rounded-[7px] border text-sm font-medium transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50",
                  isFavorite
                    ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-hover)]"
                    : "border-[var(--border)] text-[var(--text-secondary)]",
                )}
              >
                <Heart className={cn("size-4", isFavorite && "fill-current")} />
                {isFavorite ? "已收藏" : "收藏"}
              </button>
              <button
                type="button"
                onClick={onPublish}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[7px] border border-[var(--border)] text-sm font-medium transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <Send className="size-4" />
                {asset.publicationReviewStatus === "APPROVED" ? "查看发布" : "发布"}
              </button>
            </div>
            <button
              type="button"
              onClick={onDelete}
              disabled={isDeleting}
              className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[7px] bg-destructive/10 text-sm font-medium text-destructive transition hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="size-4" />
              删除图片
            </button>
          </section>
        }
      />
      {deleteDialog}
      {publishDialog}
    </>
  );
}
function AssetSkeleton() {
  return (
    <div className={cn("mt-8", ASSET_GRID_CLASS)}>
      {Array.from({ length: 12 }, (_, index) => (
        <div key={index} className="aspect-square animate-pulse rounded-[8px] bg-[var(--skeleton)]" />
      ))}
    </div>
  );
}
function EmptyAssets() {
  return (
    <section className="mx-auto mt-24 max-w-[420px] text-center">
      <div aria-hidden="true" className="relative mx-auto h-14 w-16">
        <span className="absolute left-2 top-0 size-9 border border-[var(--text-secondary)]" />
        <span className="absolute bottom-0 right-1 size-9 border border-[var(--primary)]" />
        <span className="absolute bottom-1 left-0 size-2 bg-[var(--accent)]" />
        <span className="absolute right-0 top-0 text-lg leading-none text-[var(--primary)]">✦</span>
      </div>
      <h2 className="mt-5 text-xl font-bold">还没有创作资产</h2>
      <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">完成一次图片生成后，作品会保存在这里</p>
      <Link
        href="/generate"
        className="mt-6 inline-flex h-11 items-center rounded-[7px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--surface-bg)]"
      >
        开始创作
      </Link>
    </section>
  );
}
function DeleteDialog({
  count,
  isDeleting,
  onCancel,
  onConfirm,
}: {
  count: number;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-[var(--primary)]/35 p-4"
    >
      <section className="w-full max-w-sm rounded-[10px] border border-[var(--border)] bg-[var(--surface-bg)] p-6 shadow-2xl">
        <h2 className="text-lg font-semibold">删除图片？</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          将永久删除 {count} 张图片，此操作无法撤销。
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="h-9 rounded-[6px] px-3 text-sm font-medium text-[var(--text-secondary)]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex h-9 items-center gap-2 rounded-[6px] bg-[var(--accent)] px-3 text-sm font-medium text-white disabled:opacity-60"
          >
            {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : null}删除
          </button>
        </div>
      </section>
    </div>
  );
}
