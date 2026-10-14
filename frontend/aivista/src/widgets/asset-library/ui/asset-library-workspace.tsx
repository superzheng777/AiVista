"use client";

import { copyGenerationImage } from "@/entities/image-resource/lib/copy-generation-image";
import { needsImageUrlRefresh, type GenerationAsset } from "@/entities/image-resource/model/image-resource";
import { optimisticResourceUpdate } from "@/entities/image-resource/model/optimistic-resource-update";
import { cancelResourceQueries, patchResource, removeResources } from "@/entities/image-resource/model/resource-cache";
import { useImageDetailNavigation } from "@/entities/image-resource/model/use-image-detail-navigation";
import { useUserEventStreamStore } from "@/entities/user-event-stream/model/user-event-stream-store";
import {
  assetQueryKeys,
  deleteGenerationAssets,
  getGenerationAsset,
  listGenerationAssets,
  setGenerationImageFavorites,
} from "@/features/assets/api/asset-api";
import { downloadOriginalGenerationImage } from "@/features/assets/lib/original-image-download";
import { AssetDetail } from "@/features/assets/ui/asset-detail";
import { PublicationFormDialog } from "@/features/publication/ui/publication-form-dialog";
import { personalResourceListPolicy } from "@/shared/api/resource-list-policy";
import { AccentSquare, DotMatrix } from "@/shared/ui/editorial-ornaments/editorial-ornaments";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { groupsOf } from "../model/asset-groups";
import { BulkBar } from "./asset-bulk-bar";
import { AssetCard } from "./asset-card";
import { AssetGroups, AssetSkeleton, EmptyAssets } from "./asset-groups";
import { DeleteDialog } from "./delete-assets-dialog";

const EMPTY_ASSETS: GenerationAsset[] = [];

export function AssetLibraryWorkspace() {
  const client = useQueryClient();
  const router = useRouter();
  const hasCompletedResults = useUserEventStreamStore((state) => state.completedSessionIds.size > 0);
  const acknowledgeCompletedResults = useUserEventStreamStore((state) => state.acknowledgeCompletedResults);
  const acknowledgedAt = useRef(0);
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string[] | null>(null);
  const [publishing, setPublishing] = useState<GenerationAsset | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const query = useQuery({
    ...personalResourceListPolicy,
    queryKey: assetQueryKeys.all,
    queryFn: listGenerationAssets,
  });
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
      client
        .getQueryCache()
        .find({ queryKey: assetQueryKeys.all, exact: true })
        ?.setState({
          data: previous?.filter((asset) => !ids.includes(asset.id)),
        });
      return { previous };
    },
    onSuccess: (_result, ids) => {
      removeResources(client, ids);
      setSelected((current) => new Set([...current].filter((id) => !ids.includes(id))));
      setDetailId((id) => (id && ids.includes(id) ? null : id));
      setNotice(`已删除 ${ids.length} 张图片`);
    },
    onError: (_error, _ids, context) => {
      client.getQueryCache().find({ queryKey: assetQueryKeys.all, exact: true })?.setState({ data: context?.previous });
      setNotice("删除失败，请重试。");
    },
    onSettled: () => setDeleting(null),
  });
  const favorite = useMutation({
    mutationFn: ({ ids, value }: { ids: string[]; value: boolean }) => setGenerationImageFavorites(ids, value),
    onMutate: async ({ ids, value }) => {
      await cancelResourceQueries(client, ids);
      return optimisticResourceUpdate(client, new Map(ids.map((id) => [id, { favorited: value }])));
    },
    onSuccess: async (_result, { value }, context) => {
      await context.finish(true);
      setNotice(value ? "已收藏图片" : "已取消收藏");
    },
    onError: async (_error, _data, context) => {
      await context?.finish(false);
      setNotice("收藏状态更新失败，请重试。");
    },
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
    patchResource(client, id, { imageUrls: result.imageUrls });
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
  async function copy(asset: GenerationAsset) {
    try {
      await copyGenerationImage(asset, refresh);
      setNotice("图片已复制。");
    } catch {
      setNotice("复制失败，请使用下载。");
    }
  }
  function publish(asset: GenerationAsset) {
    if (asset.publicationReviewStatus === "APPROVED") {
      router.push(`/inspirations?imageId=${encodeURIComponent(asset.id)}`);
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
                onSuccess={() => {
                  setPublishing(null);
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
        <AssetGroups
          groups={groups}
          renderAsset={(asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              managing={managing}
              selected={selected.has(asset.id)}
              opening={openingId === asset.id}
              favoriteUpdating={favorite.isPending}
              isDeleting={remove.isPending}
              onOpen={() => void open(asset)}
              onSelect={() => toggle(asset.id)}
              onBeginManaging={() => {
                setManaging(true);
                setSelected((current) => new Set([...current, asset.id]));
              }}
              onFavorite={() => favorite.mutate({ ids: [asset.id], value: !asset.favorited })}
              onDownload={() => void download(asset)}
              onCopy={() => copy(asset)}
              onPublish={() => publish(asset)}
              onDelete={() => setDeleting([asset.id])}
            />
          )}
        />
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
            setNotice("图片已发布，正在审核。");
          }}
        />
      ) : null}
    </section>
  );
}
