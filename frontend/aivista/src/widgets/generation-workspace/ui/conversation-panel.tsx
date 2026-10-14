"use client";

import { isActiveCreation, mergeSessionSnapshot, type SessionDetail } from "@/entities/creation-session/model/session";
import type { GenerationAsset } from "@/entities/image-resource/model/image-resource";
import { patchResource, removeResources } from "@/entities/image-resource/model/resource-cache";
import { ImageDetailShell } from "@/entities/image-resource/ui/image-detail-shell";
import { OwnedImageDetailActions } from "@/entities/image-resource/ui/owned-image-detail-actions";
import { useUserEventStreamStore } from "@/entities/user-event-stream/model/user-event-stream-store";
import {
  deleteGenerationAssets,
  getGenerationAsset,
  setGenerationImageFavorites,
} from "@/features/assets/api/asset-api";
import { downloadOriginalGenerationImage } from "@/features/assets/lib/original-image-download";
import {
  cancelCreation,
  generationQueryKeys,
  getGenerationSession,
  resolveAgentForm,
} from "@/features/generation/api/generation-api";
import { hydrateSession, receiveCreationEvent } from "@/features/generation/model/session-events";
import { GenerationComposer } from "@/features/generation/ui/generation-composer";
import { PublicationFormDialog } from "@/features/publication/ui/publication-form-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BOTTOM_FOLLOW_THRESHOLD_PX, nextBottomFollowState } from "../model/conversation-scroll";
import { ConversationTurn } from "./conversation-turn";

export function ConversationPanel({ sessionId, toolbar }: { sessionId: string; toolbar: ReactNode }) {
  const client = useQueryClient();
  const router = useRouter();
  const syncVersion = useUserEventStreamStore((state) => state.syncVersion);
  const acknowledgeSession = useUserEventStreamStore((state) => state.acknowledgeSession);
  const lastSync = useRef(syncVersion);
  const historyRef = useRef<HTMLDivElement>(null);
  const composerDockRef = useRef<HTMLDivElement>(null);
  const positioned = useRef(false);
  const lastScrollTop = useRef(0);
  const [isFollowingBottom, setIsFollowingBottom] = useState(true);
  const [isComposerCollapsed, setIsComposerCollapsed] = useState(false);
  const [detail, setDetail] = useState<GenerationAsset | null>(null);
  const [publication, setPublication] = useState<GenerationAsset | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const session = useQuery({
    queryKey: generationQueryKeys.session(sessionId),
    queryFn: async () => hydrateSession(client, await getGenerationSession(sessionId)),
    structuralSharing: (current, incoming) =>
      mergeSessionSnapshot(current as SessionDetail | undefined, incoming as SessionDetail),
    staleTime: Infinity,
  });

  useEffect(() => {
    const history = historyRef.current;
    const dock = composerDockRef.current;
    if (!history || !dock) return;
    // Match the history viewport, excluding its scrollbar, so both columns align.
    const alignDock = () => {
      dock.style.width = `${history.clientWidth}px`;
    };
    alignDock();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(alignDock);
    observer.observe(history);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    acknowledgeSession(sessionId);
    if (lastSync.current !== syncVersion) {
      lastSync.current = syncVersion;
      void client.invalidateQueries({ queryKey: generationQueryKeys.session(sessionId) });
      void client.invalidateQueries({ queryKey: generationQueryKeys.sessions() });
    }
  }, [acknowledgeSession, client, sessionId, syncVersion]);
  useEffect(() => {
    if (!session.data || !isFollowingBottom) return;
    const frame = window.requestAnimationFrame(() => {
      const history = historyRef.current;
      if (!history) return;
      // Content can grow as streamed text, forms and images finish layout.
      history.scrollTo({ top: history.scrollHeight, behavior: positioned.current ? "smooth" : "auto" });
      lastScrollTop.current = history.scrollTop;
      positioned.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [session.data, isFollowingBottom]);

  function scrollToBottom() {
    setIsFollowingBottom(true);
    setIsComposerCollapsed(false);
    historyRef.current?.scrollTo({
      top: historyRef.current.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }
  function handleHistoryScroll(history: HTMLDivElement) {
    const distance = history.scrollHeight - history.scrollTop - history.clientHeight;
    const scrollingUp = history.scrollTop < lastScrollTop.current - 1;
    lastScrollTop.current = history.scrollTop;
    setIsComposerCollapsed(distance > BOTTOM_FOLLOW_THRESHOLD_PX);
    setIsFollowingBottom((current) => nextBottomFollowState(current, distance, scrollingUp));
  }

  const cancel = useMutation({
    mutationFn: cancelCreation,
    onSuccess: (result) => receiveCreationEvent(client, { type: "creation.updated", sessionId, ...result }),
    onError: () => setNotice("取消失败，请重试。"),
  });
  const answer = useMutation({
    mutationFn: resolveAgentForm,
    onSuccess: (result) => {
      receiveCreationEvent(client, {
        type: "creation.item.upserted",
        sessionId,
        creationId: result.creationId,
        item: result.item,
      });
      receiveCreationEvent(client, {
        type: "creation.updated",
        sessionId,
        creationId: result.creationId,
        status: result.status,
        revision: result.revision,
      });
    },
    onError: () => setNotice("表单提交失败，请检查内容后重试。"),
  });
  const favorite = useMutation({
    mutationFn: async (asset: GenerationAsset) => {
      await setGenerationImageFavorites([asset.id], !asset.favorited);
      return { ...asset, favorited: !asset.favorited };
    },
    onSuccess: (asset) => {
      setDetail(asset);
      patchResource(client, asset.id, { favorited: asset.favorited });
    },
    onError: () => setNotice("收藏更新失败。"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteGenerationAssets([id]),
    onSuccess: (_, id) => {
      setDetail(null);
      removeResources(client, [id]);
      client.setQueryData<SessionDetail>(generationQueryKeys.session(sessionId), (value) =>
        value
          ? {
              ...value,
              turns: value.turns.map((turn) => ({
                ...turn,
                items: turn.items.map((item) =>
                  item.kind === "generation"
                    ? {
                        ...item,
                        assets: item.assets.map((asset) => (asset.assetId === id ? { ...asset, url: null } : asset)),
                      }
                    : item,
                ),
              })),
            }
          : value,
      );
    },
    onError: () => setNotice("图片删除失败。"),
  });
  async function openImage(assetId: string) {
    try {
      setDetail(await getGenerationAsset(assetId));
    } catch {
      setNotice("图片已删除或暂时无法读取。");
    }
  }

  async function refreshAsset(id: string) {
    const image = await getGenerationAsset(id);
    patchResource(client, id, { imageUrls: image.imageUrls });
    return image;
  }
  function requestPublish(asset: GenerationAsset) {
    if (asset.publicationReviewStatus === "PENDING") return setNotice("该图片正在审核中。");
    if (asset.publicationReviewStatus === "APPROVED") router.push(`/inspirations?imageId=${asset.id}`);
    else setPublication(asset);
  }
  const imageIds =
    session.data?.turns.flatMap((turn) =>
      turn.items.flatMap((item) =>
        item.kind === "generation" ? item.assets.filter((asset) => asset.url).map((asset) => asset.assetId) : [],
      ),
    ) ?? [];
  const detailIndex = detail ? imageIds.indexOf(detail.id) : -1;
  if (detail)
    return (
      <>
        <ImageDetailShell
          image={detail}
          navigation={{
            hasPrevious: detailIndex > 0,
            hasNext: detailIndex >= 0 && detailIndex < imageIds.length - 1,
            pending: false,
            previous: () => void openImage(imageIds[detailIndex - 1]!),
            next: () => void openImage(imageIds[detailIndex + 1]!),
          }}
          onClose={() => setDetail(null)}
          refreshImage={async (id) => {
            const value = await getGenerationAsset(id);
            setDetail(value);
            return value;
          }}
          onDownload={() => downloadOriginalGenerationImage(detail)}
          headerActions={(onCopy) => (
            <OwnedImageDetailActions
              image={detail}
              isFavoriteUpdating={favorite.isPending}
              isDeleting={remove.isPending}
              onFavorite={() => favorite.mutate(detail)}
              onPublish={() => requestPublish(detail)}
              onCopy={onCopy}
              onDelete={() => {
                if (window.confirm("确定删除这张图片？此操作无法撤销。")) remove.mutate(detail.id);
              }}
            />
          )}
        />
        {publication ? (
          <PublicationFormDialog
            asset={publication}
            onClose={() => setPublication(null)}
            onSuccess={() => {
              setPublication(null);
              void openImage(detail.id);
            }}
          />
        ) : null}
        {notice ? <p role="status">{notice}</p> : null}
      </>
    );
  const active = session.data?.turns.some((turn) => isActiveCreation(turn.status)) ?? false;
  const limitReached = (session.data?.creationCount ?? 0) >= (session.data?.creationLimit ?? 30);
  return (
    <main className="relative flex h-[calc(100dvh-4rem)] min-w-0 flex-col bg-[var(--page-bg)] lg:h-dvh lg:min-h-0">
      {toolbar}
      <div
        ref={historyRef}
        aria-label="当前会话历史"
        className="min-h-0 flex-1 overflow-y-auto px-5 pt-20 pb-[224px] sm:px-8 lg:px-12"
        onScroll={(event) => handleHistoryScroll(event.currentTarget)}
      >
        <div className="mx-auto max-w-[1040px]">
          <div className="w-full max-w-[920px]">
            {session.isPending ? <HistorySkeleton /> : null}
            {session.isError ? <button onClick={() => void session.refetch()}>历史加载失败，点击重试</button> : null}
            {notice ? (
              <p
                role="status"
                className="mb-4 rounded-[7px] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--accent-hover)]"
              >
                {notice}
              </p>
            ) : null}
            {session.data?.turns.map((turn) => (
              <ConversationTurn
                key={turn.creationId}
                turn={turn}
                cancelling={cancel.isPending && cancel.variables === turn.creationId}
                submittingFormId={
                  answer.isPending && answer.variables?.creationId === turn.creationId
                    ? answer.variables.toolCallId
                    : null
                }
                onCancel={() => cancel.mutate(turn.creationId)}
                onResolve={(toolCallId, action, form) =>
                  answer.mutate({
                    creationId: turn.creationId,
                    toolCallId,
                    expectedRevision: turn.revision,
                    action: action === "SUBMIT" ? "SUBMITTED" : "SKIPPED",
                    form,
                  })
                }
                onOpen={(id) => void openImage(id)}
                onRefresh={refreshAsset}
                onFavorite={(asset) => favorite.mutate(asset)}
                onPublish={requestPublish}
                onDelete={(asset) => {
                  if (window.confirm("确定删除这张图片？此操作无法撤销。")) remove.mutate(asset.id);
                }}
              />
            ))}
            {!session.isPending && !session.data?.turns.length ? (
              <p className="flex min-h-56 items-center justify-center text-sm text-[var(--text-secondary)]">
                这个会话还没有可展示的历史内容。
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <div
        ref={composerDockRef}
        className="pointer-events-none absolute left-0 bottom-0 z-10 w-full px-5 pb-5 sm:px-8 lg:px-12"
      >
        <div className="mx-auto w-full max-w-[1040px]">
          <div className="pointer-events-auto w-full max-w-[920px]">
            {!isFollowingBottom ? (
              <div className="mb-3 flex justify-center">
                <button
                  type="button"
                  onClick={scrollToBottom}
                  aria-label="回到底部"
                  className="inline-flex size-10 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-bg)] text-[var(--primary)] shadow-lg transition hover:border-[var(--accent-border)] hover:bg-[var(--active-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <ArrowDown aria-hidden="true" className="size-4" />
                </button>
              </div>
            ) : null}
            {limitReached ? (
              <p className="mb-3 text-sm">当前会话已达到30轮创作上限，请开启新会话。已有表单仍可继续处理。</p>
            ) : null}
            <GenerationComposer
              sessionId={sessionId}
              compact={isComposerCollapsed}
              onExpand={() => setIsComposerCollapsed(false)}
              hasActiveCreation={active || limitReached}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

function HistorySkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-5 w-4/5 bg-[var(--skeleton)]" />
      <div className="h-64 max-w-xl rounded-[10px] bg-[var(--skeleton)]" />
    </div>
  );
}
