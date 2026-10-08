"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, CheckCircle2, FolderClock, MessageSquare, PencilLine, Sparkles } from "lucide-react";
import Link from "next/link";
import { cn } from "@/shared/lib/cn";
import { AccentSquare, DotMatrix } from "@/shared/ui/editorial-ornaments/editorial-ornaments";
import { BOTTOM_FOLLOW_THRESHOLD_PX, nextBottomFollowState } from "../model/conversation-scroll";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { GenerationAsset } from "@/entities/generation/model/generation";
import {
  isActiveCreation,
  mergeSessionSnapshot,
  type SessionAsset,
  type SessionDetail,
} from "@/entities/generation/model/session";
import { ImageDetailShell } from "@/entities/generation/ui/image-detail-shell";
import { OwnedImageDetailActions } from "@/entities/generation/ui/owned-image-detail-actions";
import { patchResource, removeResources } from "@/entities/generation/model/resource-cache";
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
  listGenerationSessions,
  resolveAgentForm,
  updateGenerationSessionTitle,
} from "@/features/generation/api/generation-api";
import { hydrateSession, receiveCreationEvent } from "@/features/generation/model/session-events";
import { useGenerationEventStream } from "@/features/generation/model/generation-event-stream-provider";
import { GenerationComposer, type GenerationComposerDraft } from "./generation-composer";
import { ConversationTurn } from "./conversation-turn";
import { PublicationFormDialog } from "@/features/publication/ui/publication-form-dialog";

export function GenerateWorkspace() {
  const router = useRouter();
  const sessionId = useSearchParams().get("sessionId");
  const { sessionIndicators } = useGenerationEventStream();
  const sessionsQuery = useQuery({ queryKey: generationQueryKeys.sessions(), queryFn: listGenerationSessions });
  const sessions = sessionsQuery.data;
  function selectSession(nextSessionId: string) {
    router.push(`/generate?sessionId=${encodeURIComponent(nextSessionId)}`);
  }

  return (
    <section className="min-h-dvh overflow-x-hidden bg-[var(--page-bg)] text-[var(--primary)]">
      <div className="grid min-h-dvh lg:h-dvh lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="hidden min-h-0 border-r border-[var(--border)] bg-[var(--surface-bg)] lg:block">
          <div className="sticky top-0 flex h-dvh flex-col overflow-y-auto px-6 py-[30px]">
            <p className="pl-1 text-[11px] font-semibold leading-none tracking-[0.16em] text-[var(--text-secondary)]">
              <span className="text-[var(--accent)]">02</span> / CREATE
            </p>
            <div className="mt-[14px] flex items-center justify-between">
              <h1 className="text-2xl font-bold leading-tight">开启创作</h1>
              <Sparkles className="size-5 text-[var(--text-secondary)]" />
            </div>
            <button
              type="button"
              onClick={() => router.push("/generate")}
              className="mt-6 inline-flex h-[52px] w-full items-center gap-3 rounded-[7px] bg-[var(--primary)] pl-7 text-left text-base font-semibold text-[var(--surface-bg)] transition-colors hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            >
              <PencilLine className="size-[18px]" />
              新对话
            </button>
            <div className="mt-5">
              <nav aria-label="历史会话" className="space-y-2">
                {sessionsQuery.isPending ? <SessionSkeleton /> : null}
                {sessionsQuery.isError ? (
                  <button
                    onClick={() => void sessionsQuery.refetch()}
                    className="px-2 py-3 text-sm text-[var(--accent-hover)]"
                  >
                    会话加载失败，点击重试
                  </button>
                ) : null}
                {sessions?.map((session) => (
                  <button
                    key={session.sessionId}
                    type="button"
                    onClick={() => selectSession(session.sessionId)}
                    aria-current={sessionId === session.sessionId ? "page" : undefined}
                    className={cn(
                      "flex h-[52px] w-full items-center gap-[10px] rounded-[7px] px-[14px] text-left text-sm transition",
                      sessionId === session.sessionId
                        ? "border border-[var(--accent-border)] bg-[var(--active-bg)] font-medium text-[var(--primary)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] hover:text-[var(--primary)]",
                    )}
                  >
                    <MessageSquare className="size-[18px] shrink-0" />
                    <span title={session.title} className="min-w-0 flex-1 truncate">
                      {session.title}
                    </span>
                    {sessionId === session.sessionId ? (
                      <span aria-label="当前会话" className="size-[9px] shrink-0 bg-[var(--accent)]" />
                    ) : sessionIndicators?.[session.sessionId] === "COMPLETED" ? (
                      <CheckCircle2 aria-label="有新的生成结果" className="size-3.5 shrink-0 text-[var(--accent)]" />
                    ) : sessionIndicators?.[session.sessionId] === "ATTENTION" ? (
                      <span aria-label="生成失败" className="size-2 shrink-0 bg-[var(--accent-hover)]" />
                    ) : null}
                  </button>
                ))}
                {!sessionsQuery.isPending && !sessions?.length ? (
                  <p className="px-2 py-2 text-xs leading-5 text-[var(--text-secondary)]">尚无历史会话。</p>
                ) : null}
              </nav>
            </div>
          </div>
        </aside>
        {sessionId ? <ConversationPanel key={sessionId} sessionId={sessionId} /> : <NewConversationPanel />}
      </div>
    </section>
  );
}

function NewConversationPanel() {
  return (
    <main className="relative flex min-h-[calc(100dvh-4rem)] min-w-0 flex-col overflow-hidden bg-[var(--page-bg)] px-5 py-16 pb-24 sm:px-8 lg:min-h-dvh lg:px-12 lg:py-0">
      <WorkspaceDecorations />
      <div className="relative z-10 mx-auto flex w-full max-w-[1040px] flex-1 flex-col justify-center lg:-translate-y-5">
        <div className="text-center">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-[var(--text-secondary)]">
            <span className="text-[var(--accent)]">01</span> / START CREATING
          </p>
          <h1 className="mt-6 text-[28px] font-bold leading-[1.25] tracking-tight sm:text-[32px] lg:text-[38px]">
            你好，想创作什么？
          </h1>
          <p className="mt-[14px] text-[15px] leading-6 text-[var(--text-secondary)]">
            写下第一个想法，提交后会自动建立创作会话。
          </p>
        </div>
        <div className="mt-10">
          <GenerationComposer />
        </div>
      </div>
      <ArchiveLine label="TURN AN IDEA INTO AN IMAGE" />
    </main>
  );
}

function ConversationPanel({ sessionId }: { sessionId: string }) {
  const client = useQueryClient();
  const router = useRouter();
  const { syncVersion, acknowledgeSession } = useGenerationEventStream();
  const lastSync = useRef(syncVersion);
  const historyRef = useRef<HTMLDivElement>(null);
  const positioned = useRef(false);
  const lastScrollTop = useRef(0);
  const [isFollowingBottom, setIsFollowingBottom] = useState(true);
  const [isComposerCollapsed, setIsComposerCollapsed] = useState(false);
  const [detail, setDetail] = useState<GenerationAsset | null>(null);
  const [publication, setPublication] = useState<GenerationAsset | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ key: number; value: GenerationComposerDraft } | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const session = useQuery({
    queryKey: generationQueryKeys.session(sessionId),
    queryFn: async () => hydrateSession(client, await getGenerationSession(sessionId)),
    structuralSharing: (current, incoming) =>
      mergeSessionSnapshot(current as SessionDetail | undefined, incoming as SessionDetail),
    staleTime: Infinity,
  });

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
  const rename = useMutation({
    mutationFn: (title: string) => updateGenerationSessionTitle(sessionId, title),
    onSuccess: ({ title }) => {
      client.setQueryData<SessionDetail>(generationQueryKeys.session(sessionId), (value) =>
        value ? { ...value, title } : value,
      );
      void client.invalidateQueries({ queryKey: generationQueryKeys.sessions() });
      setEditingTitle(false);
    },
    onError: () => setNotice("标题修改失败，请重试。"),
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
  async function continueWith(asset: SessionAsset, prompt: string) {
    try {
      setDraft({
        key: Date.now(),
        value: { mode: "agent", prompt, referenceImages: [await getGenerationAsset(asset.assetId)] },
      });
      setIsComposerCollapsed(false);
    } catch {
      setNotice("参考图片加载失败。");
    }
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
          allowCopy={detail.publicationReviewStatus === "NONE"}
          refreshImage={async (id) => {
            const value = await getGenerationAsset(id);
            setDetail(value);
            return value;
          }}
          onDownload={() => downloadOriginalGenerationImage(detail)}
          actions={
            <OwnedImageDetailActions
              image={detail}
              isFavoriteUpdating={favorite.isPending}
              isDeleting={remove.isPending}
              onFavorite={() => favorite.mutate(detail)}
              onPublish={() => requestPublish(detail)}
              onDelete={() => {
                if (window.confirm("确定删除这张图片？此操作无法撤销。")) remove.mutate(detail.id);
              }}
            />
          }
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
      <header className="flex min-h-[74px] items-center justify-between border-b border-[var(--border)] bg-[var(--surface-bg)]/80 px-5 sm:px-8">
        {editingTitle ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              rename.mutate(String(new FormData(event.currentTarget).get("title")));
            }}
          >
            <input name="title" aria-label="会话标题" defaultValue={session.data?.title} maxLength={100} required />
            <button disabled={rename.isPending}>保存</button>
          </form>
        ) : (
          <button
            className="min-w-0 truncate text-base font-bold sm:text-lg"
            title={session.data?.title}
            onClick={() => setEditingTitle(true)}
          >
            {session.data?.title ?? "创作会话"}
            <PencilLine className="ml-2 inline size-3.5" />
          </button>
        )}
        <Link
          href="/assets"
          className="ml-4 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface-bg)] px-3 text-sm font-medium transition hover:bg-[var(--active-bg)]"
        >
          <FolderClock className="size-4" />
          资产库
        </Link>
      </header>
      <div
        ref={historyRef}
        aria-label="当前会话历史"
        className="min-h-0 flex-1 overflow-y-auto px-5 py-7 pb-[224px] sm:px-8 lg:px-12"
        onScroll={(event) => handleHistoryScroll(event.currentTarget)}
      >
        <div className="mx-auto max-w-[1040px]">
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
              onContinue={(asset, prompt) => void continueWith(asset, prompt)}
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
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-5 pb-5 sm:px-8 lg:px-12">
        <div
          className={`pointer-events-auto mx-auto w-full transition-[max-width] duration-300 ${isComposerCollapsed ? "max-w-[860px]" : "max-w-[1040px]"}`}
        >
          {!isFollowingBottom ? (
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={scrollToBottom}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface-bg)] px-4 text-xs font-medium text-[var(--primary)] shadow-lg transition hover:border-[var(--accent-border)] hover:bg-[var(--active-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <ArrowDown className="size-4" />
                回到底部
              </button>
            </div>
          ) : null}
          {limitReached ? (
            <p className="mb-3 text-sm">当前会话已达到30轮创作上限，请开启新会话。已有表单仍可继续处理。</p>
          ) : null}
          <GenerationComposer
            key={draft?.key ?? "composer"}
            sessionId={sessionId}
            compact={isComposerCollapsed}
            onExpand={() => setIsComposerCollapsed(false)}
            hasActiveCreation={active || limitReached}
            initialDraft={draft?.value}
          />
        </div>
      </div>
    </main>
  );
}

function WorkspaceDecorations() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
      <span className="absolute right-[7%] top-[94px] hidden h-[390px] w-[290px] bg-[var(--active-bg)] lg:block" />
      <div className="absolute left-[13%] top-[150px] hidden h-[111px] w-[161px] lg:block">
        <DotMatrix columns={5} rows={5} dotSize={6} gap={16} opacity={0.55} className="absolute left-0 top-0" />
        <AccentSquare size={17} className="absolute bottom-0 right-0" />
      </div>
    </div>
  );
}
function ArchiveLine({ label }: { label: string }) {
  return (
    <div aria-hidden="true" className="relative z-0 mt-auto hidden items-center gap-[14px] pb-[58px] pt-8 lg:flex">
      <span className="size-2 shrink-0 bg-[var(--text-secondary)]" />
      <span className="h-px flex-1 bg-[var(--border-strong)]" />
      <span className="shrink-0 whitespace-nowrap text-[10px] font-medium tracking-[0.18em] text-[var(--text-secondary)]">
        {label}
      </span>
      <span className="size-2 shrink-0 bg-[var(--accent)]" />
    </div>
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
function SessionSkeleton() {
  return <div className="h-[52px] animate-pulse rounded-[7px] bg-[var(--skeleton-light)]" />;
}
