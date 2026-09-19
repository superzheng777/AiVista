"use client";

import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  CircleStop,
  Clipboard,
  Download,
  Ellipsis,
  FolderClock,
  Heart,
  ImageOff,
  LoaderCircle,
  MessageSquare,
  PencilLine,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  needsImageUrlRefresh,
  type GenerationAsset,
  type GenerationSession,
  type GenerationTask,
  type GenerationTurn,
} from "@/entities/generation/model/generation";
import { ImageDetailShell } from "@/entities/generation/ui/image-detail-shell";
import {
  assetQueryKeys,
  deleteGenerationAssets,
  getGenerationAsset,
  setGenerationImageFavorites,
} from "@/features/assets/api/asset-api";
import { downloadOriginalGenerationImage } from "@/features/assets/lib/original-image-download";
import {
  cancelAgentCreation,
  generationQueryKeys,
  listGenerationSessions,
  listGenerationTurns,
} from "@/features/generation/api/generation-api";
import {
  GenerationComposer,
  type GenerationComposerDraft,
} from "@/features/generation/ui/generation-composer";
import {
  useGenerationEventStream,
  type GenerationSessionIndicator,
} from "@/features/generation/model/generation-event-stream-provider";
import {
  BOTTOM_FOLLOW_THRESHOLD_PX,
  nextBottomFollowState,
} from "@/features/generation/model/conversation-scroll";
import {
  mergeGenerationTurnPageData,
  type GenerationTurnPage,
} from "@/features/generation/model/generation-turn-cache";
import { PublicationFormDialog } from "@/features/publication/ui/publication-form-dialog";
import { cn } from "@/lib/utils";
import {
  AccentSquare,
  DotMatrix,
} from "@/shared/ui/editorial-ornaments/editorial-ornaments";

function taskStatusText(
  task: Pick<GenerationTask, "status" | "retryCount" | "maxRetryCount">,
): string {
  const retryProgress = `${task.retryCount}/${task.maxRetryCount}`;
  if (task.status === "QUEUED" && task.retryCount > 0)
    return `模型调用失败，正在重试（${retryProgress}）`;
  if (task.status === "QUEUED") return "图片排队中";
  if (task.status === "GENERATING") return "正在生成图片";
  if (task.status === "SAVING") return "正在保存图片";
  if (task.status === "SUCCEEDED") return "生成已完成";
  if (task.status === "PARTIALLY_SUCCEEDED") return "部分图片已生成";
  if (task.status === "FAILED") return "生成失败";
  return "尚未开始生成";
}

export function GenerateWorkspace() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  const { sessionIndicators, syncVersion } = useGenerationEventStream();
  const sessionsQuery = useInfiniteQuery({
    queryKey: generationQueryKeys.sessions(),
    queryFn: ({ pageParam }) => listGenerationSessions(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const sessions = sessionsQuery.data?.pages.flatMap((page) => page.items);
  const activeSessionTitle = sessionId
    ? sessions?.find((session) => session.id === sessionId)?.title
    : undefined;
  useEffect(() => {
    if (syncVersion > 0)
      void queryClient.refetchQueries({
        queryKey: generationQueryKeys.sessions(),
        type: "active",
      });
  }, [queryClient, syncVersion]);
  function selectSession(nextSessionId: string): void {
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
              <SessionList
                sessions={sessions}
                indicators={sessionIndicators}
                isLoading={sessionsQuery.isLoading}
                isError={sessionsQuery.isError}
                hasNextPage={sessionsQuery.hasNextPage}
                isFetchingNextPage={sessionsQuery.isFetchingNextPage}
                activeSessionId={sessionId}
                onSelect={selectSession}
                onLoadMore={() => void sessionsQuery.fetchNextPage()}
                onRetry={() => void sessionsQuery.refetch()}
              />
            </div>
          </div>
        </aside>
        {sessionId ? (
          <ConversationPanel
            sessionId={sessionId}
            sessionTitle={activeSessionTitle}
          />
        ) : (
          <NewConversationPanel />
        )}
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

function ConversationPanel({
  sessionId,
  sessionTitle,
}: {
  sessionId: string;
  sessionTitle?: string;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { acknowledgeSession, agentRuns, sessionIndicators, syncVersion } =
    useGenerationEventStream();
  const historyRef = useRef<HTMLElement>(null);
  const positionedSessionRef = useRef<string | null>(null);
  const lastScrollTopRef = useRef(0);
  const [isFollowingBottom, setIsFollowingBottom] = useState(true);
  const [isComposerCollapsed, setIsComposerCollapsed] = useState(false);
  const [detailAsset, setDetailAsset] = useState<GenerationAsset | null>(null);
  const [publishAsset, setPublishAsset] = useState<GenerationAsset | null>(
    null,
  );
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [composerDraft, setComposerDraft] = useState<{
    key: number;
    value: GenerationComposerDraft;
  } | null>(null);
  const turnsQuery = useInfiniteQuery<
    GenerationTurnPage,
    Error,
    InfiniteData<GenerationTurnPage>,
    ReturnType<typeof generationQueryKeys.turns>,
    string | undefined
  >({
    queryKey: generationQueryKeys.turns(sessionId),
    queryFn: ({ pageParam }) => listGenerationTurns(sessionId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextBefore ?? undefined,
    structuralSharing: mergeGenerationTurnPageData,
  });
  const turns = turnsQuery.data
    ? [...turnsQuery.data.pages].reverse().flatMap((page) => page.items)
    : undefined;
  const hasActiveCreation =
    turns?.some((turn) => turn.status === "RUNNING") ?? false;
  useEffect(() => {
    if (
      turnsQuery.isLoading ||
      !turns ||
      positionedSessionRef.current === sessionId
    )
      return;
    const frame = window.requestAnimationFrame(() => {
      const history = historyRef.current;
      if (history) {
        history.scrollTop = history.scrollHeight;
        lastScrollTopRef.current = history.scrollTop;
      }
      setIsFollowingBottom(true);
      positionedSessionRef.current = sessionId;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [sessionId, turns, turnsQuery.isLoading]);
  useEffect(() => {
    if (!isFollowingBottom || positionedSessionRef.current !== sessionId)
      return;
    const frame = window.requestAnimationFrame(() =>
      scrollToConversationBottom("smooth"),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [agentRuns, isFollowingBottom, sessionId, turns]);
  useEffect(() => {
    if (syncVersion > 0)
      void queryClient.refetchQueries({
        queryKey: generationQueryKeys.turns(sessionId),
        type: "active",
      });
  }, [queryClient, sessionId, syncVersion]);
  const favoriteMutation = useMutation({
    mutationFn: ({
      imageId,
      favorite,
    }: {
      imageId: string;
      favorite: boolean;
    }) => setGenerationImageFavorites([imageId], favorite),
    onSuccess: () =>
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: assetQueryKeys.all }),
        queryClient.invalidateQueries({
          queryKey: generationQueryKeys.turns(sessionId),
        }),
      ]),
    onError: () => setActionNotice("收藏状态更新失败，请重试。"),
  });
  const deleteMutation = useMutation({
    mutationFn: (imageId: string) => deleteGenerationAssets([imageId]),
    onSuccess: (_result, imageId) => {
      setDetailAsset((asset) => (asset?.id === imageId ? null : asset));
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: assetQueryKeys.all }),
        queryClient.invalidateQueries({
          queryKey: generationQueryKeys.turns(sessionId),
        }),
      ]);
    },
    onError: () => setActionNotice("删除失败，请重试。"),
  });
  const cancelMutation = useMutation({
    mutationFn: cancelAgentCreation,
    onSuccess: () =>
      void Promise.all([
        queryClient.refetchQueries({
          queryKey: generationQueryKeys.sessions(),
          type: "active",
        }),
        queryClient.refetchQueries({
          queryKey: generationQueryKeys.turns(sessionId),
          type: "active",
        }),
      ]),
    onError: () =>
      setActionNotice("取消失败，创作可能已经结束，请刷新后重试。"),
  });
  useEffect(() => {
    if (
      sessionIndicators[sessionId] === "COMPLETED" ||
      sessionIndicators[sessionId] === "ATTENTION"
    )
      acknowledgeSession(sessionId);
  }, [acknowledgeSession, sessionId, sessionIndicators]);
  async function refreshAsset(imageId: string): Promise<GenerationAsset> {
    const refreshed = await getGenerationAsset(imageId);
    setDetailAsset((asset) => (asset?.id === imageId ? refreshed : asset));
    await queryClient.refetchQueries({
      queryKey: generationQueryKeys.turns(sessionId),
      type: "active",
    });
    return refreshed;
  }
  async function openAsset(asset: GenerationAsset): Promise<void> {
    try {
      setDetailAsset(
        needsImageUrlRefresh(asset.imageUrls.display)
          ? await refreshAsset(asset.id)
          : asset,
      );
    } catch {
      setActionNotice("图片访问地址刷新失败，请稍后重试。 ");
    }
  }
  function requestPublish(asset: GenerationAsset): void {
    if (asset.publicationReviewStatus === "PENDING")
      return setActionNotice("该图片正在审核中。");
    if (asset.publicationReviewStatus === "APPROVED") {
      router.push(`/inspirations?imageId=${encodeURIComponent(asset.id)}`);
      return;
    }
    setPublishAsset(asset);
  }
  function scrollToConversationBottom(behavior: ScrollBehavior): void {
    const history = historyRef.current;
    if (!history) return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    history.scrollTo({
      top: history.scrollHeight,
      behavior: reducedMotion ? "auto" : behavior,
    });
  }
  function handleHistoryScroll(history: HTMLElement): void {
    const distanceFromBottom =
      history.scrollHeight - history.scrollTop - history.clientHeight;
    const isScrollingUp = history.scrollTop < lastScrollTopRef.current - 1;
    lastScrollTopRef.current = history.scrollTop;
    setIsComposerCollapsed(distanceFromBottom > BOTTOM_FOLLOW_THRESHOLD_PX);
    setIsFollowingBottom((current) =>
      nextBottomFollowState(current, distanceFromBottom, isScrollingUp),
    );
  }
  if (detailAsset)
    return (
      <>
        {actionNotice ? (
          <p
            role="status"
            className="m-4 rounded-[7px] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--accent-hover)]"
          >
            {actionNotice}
          </p>
        ) : null}
        <ImageDetailShell
          image={detailAsset}
          refreshImage={refreshAsset}
          allowCopy={detailAsset.publicationReviewStatus === "NONE"}
          onClose={() => setDetailAsset(null)}
          actions={
            <ConversationAssetActions
              asset={detailAsset}
              isFavoriteUpdating={favoriteMutation.isPending}
              isDeleting={deleteMutation.isPending}
              onFavorite={() =>
                favoriteMutation.mutate({
                  imageId: detailAsset.id,
                  favorite: !detailAsset.favorited,
                })
              }
              onPublish={() => requestPublish(detailAsset)}
              onDelete={() => {
                if (window.confirm("确定删除这张图片？此操作无法撤销。"))
                  deleteMutation.mutate(detailAsset.id);
              }}
            />
          }
        />
        {publishAsset ? (
          <PublicationFormDialog
            asset={publishAsset}
            onClose={() => setPublishAsset(null)}
            onSuccess={(result) => {
              setPublishAsset(null);
              setDetailAsset((asset) =>
                asset
                  ? { ...asset, publicationReviewStatus: result.status }
                  : asset,
              );
              setActionNotice("图片已发布，正在审核。");
              void Promise.all([
                queryClient.invalidateQueries({ queryKey: assetQueryKeys.all }),
                queryClient.invalidateQueries({
                  queryKey: generationQueryKeys.turns(sessionId),
                }),
              ]);
            }}
          />
        ) : null}
      </>
    );
  return (
    <main className="relative flex min-h-[calc(100dvh-4rem)] min-w-0 flex-col bg-[var(--page-bg)] lg:h-dvh lg:min-h-0">
      <header className="flex min-h-[74px] items-center justify-between border-b border-[var(--border)] bg-[var(--surface-bg)]/80 px-5 sm:px-8">
        <h1 className="min-w-0 truncate text-base font-bold sm:text-lg">
          {sessionTitle ?? "创作会话"}
        </h1>
        <div className="ml-4 flex shrink-0 items-center gap-3">
          <Link
            href="/assets"
            className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface-bg)] px-3 text-sm font-medium transition hover:bg-[var(--active-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <FolderClock className="size-4" />
            资产库
          </Link>
        </div>
      </header>
      <section
        ref={historyRef}
        aria-label="当前会话历史"
        onScroll={(event) => handleHistoryScroll(event.currentTarget)}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-7 pb-[224px] sm:px-8 lg:px-12"
      >
        <div className="mx-auto max-w-[1040px]">
          {actionNotice ? (
            <p
              role="status"
              className="mb-4 rounded-[7px] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--accent-hover)]"
            >
              {actionNotice}
            </p>
          ) : null}
          {turnsQuery.isLoading ? <HistorySkeleton /> : null}
          {turnsQuery.isError ? (
            <div
              role="alert"
              className="border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--accent-hover)]"
            >
              <p>历史对话加载失败，请重试。</p>
              <button
                type="button"
                onClick={() =>
                  void (turnsQuery.hasNextPage
                    ? turnsQuery.fetchNextPage()
                    : turnsQuery.refetch())
                }
                className="mt-1 font-medium underline"
              >
                重试
              </button>
            </div>
          ) : null}
          {turnsQuery.hasNextPage ? (
            <div className="mb-5 flex justify-center">
              <button
                type="button"
                onClick={() => void turnsQuery.fetchNextPage()}
                disabled={turnsQuery.isFetchingNextPage}
                className="inline-flex min-h-10 items-center gap-2 rounded-[6px] border border-[var(--border-strong)] bg-[var(--surface-bg)] px-3 text-sm text-[var(--text-secondary)] disabled:opacity-60"
              >
                {turnsQuery.isFetchingNextPage ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                加载更早的对话
              </button>
            </div>
          ) : null}
          {turns?.map((turn) => (
            <ConversationTurn
              key={turn.id}
              turn={turn}
              isCancelling={
                cancelMutation.isPending && cancelMutation.variables === turn.id
              }
              onCancel={() => cancelMutation.mutate(turn.id)}
              onContinue={(draft) => {
                setComposerDraft({ key: Date.now(), value: draft });
                setIsComposerCollapsed(false);
              }}
              onOpenAsset={openAsset}
              onRefreshAsset={refreshAsset}
              onFavorite={(asset) =>
                favoriteMutation.mutate({
                  imageId: asset.id,
                  favorite: !asset.favorited,
                })
              }
              onPublish={requestPublish}
              onDelete={(image) => {
                if (window.confirm("确定删除这张图片？此操作无法撤销。"))
                  deleteMutation.mutate(image.id);
              }}
            />
          ))}
          {!turnsQuery.isLoading && !turns?.length ? (
            <div className="flex min-h-56 items-center justify-center">
              <p className="text-sm text-[var(--text-secondary)]">
                这个会话还没有可展示的历史内容。
              </p>
            </div>
          ) : null}
        </div>
      </section>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-5 pb-5 sm:px-8 lg:px-12">
        <div className={`pointer-events-auto mx-auto w-full transition-[max-width] duration-300 ${isComposerCollapsed ? "max-w-[860px]" : "max-w-[1040px]"}`}>
          {!isFollowingBottom ? (
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsFollowingBottom(true);
                  scrollToConversationBottom("smooth");
                }}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface-bg)] px-4 text-xs font-medium text-[var(--primary)] shadow-lg transition hover:border-[var(--accent-border)] hover:bg-[var(--active-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <ArrowDown className="size-4" />
                回到底部
              </button>
            </div>
          ) : null}
          <GenerationComposer
            key={composerDraft?.key ?? "composer"}
            sessionId={sessionId}
            compact={isComposerCollapsed}
            onExpand={() => setIsComposerCollapsed(false)}
            hasActiveCreation={hasActiveCreation}
            initialDraft={composerDraft?.value}
          />
        </div>
      </div>
      {publishAsset ? (
        <PublicationFormDialog
          asset={publishAsset}
          onClose={() => setPublishAsset(null)}
          onSuccess={() => {
            setPublishAsset(null);
            setActionNotice("图片已发布，正在审核。");
            void Promise.all([
              queryClient.invalidateQueries({ queryKey: assetQueryKeys.all }),
              queryClient.invalidateQueries({
                queryKey: generationQueryKeys.turns(sessionId),
              }),
            ]);
          }}
        />
      ) : null}
    </main>
  );
}

function SessionList({
  sessions,
  indicators,
  isLoading,
  isError,
  hasNextPage,
  isFetchingNextPage,
  activeSessionId,
  onSelect,
  onLoadMore,
  onRetry,
}: {
  sessions: GenerationSession[] | undefined;
  indicators: Record<string, GenerationSessionIndicator>;
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-2">
      {isLoading ? <SessionSkeleton /> : null}
      {isError ? (
        <div
          role="alert"
          className="px-2 py-3 text-sm text-[var(--accent-hover)]"
        >
          <p>会话加载失败，请重试。</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 font-medium underline"
          >
            重试
          </button>
        </div>
      ) : null}
      {sessions?.map((session) => (
        <SessionListItem
          key={session.id}
          session={session}
          indicator={
            activeSessionId === session.id ? undefined : indicators[session.id]
          }
          active={activeSessionId === session.id}
          onSelect={onSelect}
        />
      ))}
      {hasNextPage ? (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isFetchingNextPage}
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[6px] px-3 text-sm text-[var(--text-secondary)] disabled:opacity-60"
        >
          {isFetchingNextPage ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : null}
          加载更多会话
        </button>
      ) : null}
      {!isLoading && !sessions?.length ? (
        <p className="px-2 py-2 text-xs leading-5 text-[var(--text-secondary)]">
          尚无历史会话。
        </p>
      ) : null}
    </div>
  );
}

function SessionListItem({
  session,
  indicator,
  active,
  onSelect,
}: {
  session: GenerationSession;
  indicator?: GenerationSessionIndicator;
  active: boolean;
  onSelect: (sessionId: string) => void;
}) {
  const statusIndicator = session.hasActiveTask ? (
    <LoaderCircle
      aria-label="正在生成"
      className="size-3.5 shrink-0 animate-spin text-[var(--accent)]"
    />
  ) : indicator === "ATTENTION" ? (
    <span
      aria-label="生成失败"
      className="size-2 shrink-0 bg-[var(--accent-hover)]"
    />
  ) : indicator === "COMPLETED" ? (
    <CheckCircle2
      aria-label="有新的生成结果"
      className="size-3.5 shrink-0 text-[var(--accent)]"
    />
  ) : null;
  return (
    <button
      type="button"
      onClick={() => onSelect(session.id)}
      className={cn(
        "flex h-[52px] w-full items-center gap-[10px] rounded-[7px] px-[14px] text-left text-sm transition",
        active
          ? "border border-[var(--accent-border)] bg-[var(--active-bg)] font-medium text-[var(--primary)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] hover:text-[var(--primary)]",
      )}
    >
      <MessageSquare className="size-[18px] shrink-0" />
      <span className="min-w-0 flex-1 truncate">{session.title}</span>
      {statusIndicator}
      {active ? (
        <span
          aria-label="当前会话"
          className="size-[9px] shrink-0 bg-[var(--accent)]"
        />
      ) : null}
    </button>
  );
}

function ConversationTurn({
  turn,
  isCancelling,
  onCancel,
  onContinue,
  onOpenAsset,
  onRefreshAsset,
  onFavorite,
  onPublish,
  onDelete,
}: {
  turn: GenerationTurn;
  isCancelling: boolean;
  onCancel: () => void;
  onContinue: (draft: GenerationComposerDraft) => void;
  onOpenAsset: (asset: GenerationAsset) => Promise<void>;
  onRefreshAsset: (imageId: string) => Promise<GenerationAsset>;
  onFavorite: (asset: GenerationAsset) => void;
  onPublish: (asset: GenerationAsset) => void;
  onDelete: (asset: GenerationAsset) => void;
}) {
  const live = useGenerationEventStream().agentRuns[turn.id];
  const transientTools = live?.tools;
  const transientSkills = live?.skills.filter(
    (skillName) =>
      !turn.activities.some(
        (activity) =>
          activity.type === "SKILL" &&
          activity.content.includes(skillDisplayName(skillName)),
      ),
  );
  const images = turn.generations.flatMap((task) => task.images);
  const completedImageCount = turn.generations.reduce(
    (total, task) => total + task.completedImageCount,
    0,
  );
  const failedImageCount = turn.generations.reduce(
    (total, task) => total + task.failedImageCount,
    0,
  );
  const failures = [
    ...new Set(
      turn.generations
        .map((task) => task.failureMessage)
        .filter((message): message is string => Boolean(message)),
    ),
  ];
  const showProcess =
    turn.mode === "AGENT" &&
    (turn.activities.length > 0 ||
      Boolean(transientTools?.length) ||
      Boolean(transientSkills?.length) ||
      Boolean(live?.text));
  const processActivities = turn.activities.filter(
    (activity) => activity.type !== "TOOL",
  );
  const persistedToolCount = turn.activities.filter(
    (activity) => activity.type === "TOOL",
  ).length;
  const visibleToolCount = persistedToolCount + (transientTools?.length ?? 0);
  const requestedImageCount = turn.generations.reduce(
    (total, task) => total + task.requestedImageCount,
    0,
  );
  const progressTotal = Math.max(
    requestedImageCount,
    visibleToolCount,
    completedImageCount + failedImageCount,
  );
  const persistedNarration = turn.activities
    .filter((activity) => activity.type === "NARRATION")
    .map((activity) => activity.content)
    .join("\n");
  const liveText =
    live?.text && !persistedNarration.includes(live.text.trim())
      ? live.text
      : "";
  const suggestions =
    turn.mode === "AGENT" && turn.status === "SUCCEEDED"
      ? continuationSuggestions(images)
      : [];
  return (
    <article className="py-7 first:pt-0">
      {turn.mode === "AGENT" ? (
        <div className="flex justify-end" aria-label="用户消息">
          <div className="w-fit max-w-[92%] rounded-[12px] border border-[var(--accent-border)] bg-[var(--active-bg)] px-5 py-3 text-[var(--primary)] sm:max-w-[82%] sm:px-6">
            <p className="whitespace-pre-wrap break-words text-sm leading-7">
              {turn.userMessage.content}
            </p>
          </div>
        </div>
      ) : null}
      <div className="mt-5 flex justify-start" aria-label="AI 回复">
        <div className="w-full max-w-[920px] rounded-[10px] border border-[var(--border)] bg-[var(--surface-bg)] p-4 shadow-[0_2px_4px_rgb(43_35_25_/_3%)] sm:p-[18px]">
          <div className="flex items-center justify-between gap-3">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent-hover)]">
              <span className="size-[11px] bg-[var(--accent)]" />
              AiVista
            </p>
            <div className="flex items-center gap-2">
              <span className="rounded-[5px] bg-[var(--accent-soft)] px-2 py-1 text-xs font-medium text-[var(--accent)]">
                {turn.mode === "NORMAL" && turn.generations[0]
                  ? taskStatusText(turn.generations[0])
                  : creationStatusText(turn.status)}
              </span>
              {turn.mode === "AGENT" && turn.status === "RUNNING" ? (
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={isCancelling}
                  className="inline-flex h-7 items-center gap-1 rounded-[5px] border border-[var(--border-strong)] px-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] disabled:opacity-50"
                >
                  <CircleStop className="size-3.5" />
                  {isCancelling ? "正在停止" : "停止"}
                </button>
              ) : null}
            </div>
          </div>
          {showProcess ? (
            <details
              open={turn.status === "RUNNING" ? true : undefined}
              className="group mt-3 rounded-[7px] border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium text-[var(--text-secondary)] marker:content-none">
                创作过程{" "}
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
              </summary>
              {processActivities.length || transientSkills?.length ? (
                <ol
                  aria-label="创作步骤"
                  className="mt-3 space-y-2 border-t border-[var(--border)] pt-3 text-xs text-[var(--text-secondary)]"
                >
                  {processActivities.map((activity) => (
                    <li
                      key={activity.sequenceNo}
                      className="flex items-start gap-2"
                    >
                      <ActivityStateMark state={activity.outcome} />
                      <span
                        className={cn(
                          "leading-5",
                          activity.type === "NARRATION" &&
                            "text-sm leading-7 text-[var(--primary)]",
                        )}
                      >
                        {activity.content}
                      </span>
                    </li>
                  ))}
                  {transientSkills?.map((skillName) => (
                    <li
                      key={`live-skill:${skillName}`}
                      className="flex items-start gap-2"
                    >
                      <ActivityStateMark state="COMPLETED" />
                      <span className="leading-5">
                        已启用{skillDisplayName(skillName)}能力。
                      </span>
                    </li>
                  ))}
                </ol>
              ) : null}
              {liveText ? <StreamingText text={liveText} /> : null}
              {progressTotal > 0 ? (
                <p className="mt-3 inline-flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <ActivityStateMark
                    state={
                      completedImageCount + failedImageCount >= progressTotal
                        ? "COMPLETED"
                        : "RUNNING"
                    }
                  />
                  {generationToolDisplayName(turn, live)} · （
                  {completedImageCount}/{progressTotal}）图片
                  {completedImageCount + failedImageCount >= progressTotal
                    ? "已生成"
                    : "生成中…"}
                </p>
              ) : null}
            </details>
          ) : null}
          {turn.mode === "NORMAL" ? (
            <div className="mt-3">
              <p className="whitespace-pre-wrap text-sm leading-7">
                {turn.userMessage.content}
              </p>
              {turn.normalGenerationRequest?.negativePrompt ? (
                <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                  负面提示词：{turn.normalGenerationRequest.negativePrompt}
                </p>
              ) : null}
            </div>
          ) : turn.assistantMessage?.content ? (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7">
              {turn.assistantMessage.content}
            </p>
          ) : null}
          {turn.mode === "NORMAL" && progressTotal > 0 ? (
            <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">
              （{completedImageCount}/{progressTotal}）图片
              {completedImageCount + failedImageCount >= progressTotal
                ? "已生成"
                : "生成中…"}
              {failedImageCount > 0 ? `，${failedImageCount} 张失败` : ""}
            </p>
          ) : null}
          {failures.map((message) => (
            <p
              key={message}
              role="alert"
              className="mt-2 text-xs leading-5 text-[var(--accent-hover)]"
            >
              {message}
            </p>
          ))}
          {images.length ? (
            <div
              aria-label={`${images.length} 张生成图片`}
              className="mt-4 flex gap-2 overflow-x-auto pb-2"
            >
              {images.map((image) => (
                <div key={image.id} className="w-[180px] shrink-0 sm:w-[220px]">
                  <GenerationImageCard
                    image={image}
                    onOpen={() => void onOpenAsset(image)}
                    onRefresh={() => onRefreshAsset(image.id)}
                    onFavorite={() => onFavorite(image)}
                    onPublish={() => onPublish(image)}
                    onDelete={() => onDelete(image)}
                  />
                </div>
              ))}
            </div>
          ) : null}
          {suggestions.length ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                你可以继续：
              </span>
              {suggestions.map((suggestion) => (
                <button
                  key={`${suggestion.asset.id}:${suggestion.prompt}`}
                  type="button"
                  onClick={() =>
                    onContinue({
                      prompt: suggestion.prompt,
                      referenceImages: [suggestion.asset],
                      mode: "agent",
                    })
                  }
                  className="inline-flex min-h-8 items-center gap-1 rounded-full border border-[var(--border-strong)] bg-[var(--surface-bg)] px-3 text-xs text-[var(--primary)] transition hover:border-[var(--accent-border)] hover:bg-[var(--active-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  {suggestion.label}
                  <ArrowUpRight className="size-3" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <ConversationArchiveLine />
    </article>
  );
}

function StreamingText({ text }: { text: string }) {
  return (
    <p
      aria-label="实时回复"
      aria-live="polite"
      className="mt-3 whitespace-pre-wrap border-t border-[var(--border)] pt-3 text-sm leading-7"
    >
      {text}
      <span
        aria-hidden="true"
        className="ml-0.5 inline-block h-4 w-px animate-pulse bg-current align-middle"
      />
    </p>
  );
}

function skillDisplayName(skillName: string): string {
  return skillName === "poster-design" ? "海报设计" : skillName;
}

function generationToolDisplayName(
  turn: GenerationTurn,
  live:
    | ReturnType<typeof useGenerationEventStream>["agentRuns"][string]
    | undefined,
): string {
  const toolNames = [
    ...turn.activities.map((activity) => activity.toolName),
    ...(live?.tools.map((tool) => tool.toolName) ?? []),
  ];
  return toolNames.includes("image_to_image") ? "图生图" : "文生图";
}

function continuationSuggestions(
  images: GenerationAsset[],
): Array<{ label: string; prompt: string; asset: GenerationAsset }> {
  if (!images.length) return [];
  if (images.length > 1)
    return images.slice(0, 3).map((asset, index) => ({
      label: `继续优化第 ${index + 1} 张`,
      prompt: `基于第 ${index + 1} 张图片继续优化，保留核心主题和构图，并提升画面细节与完成度。`,
      asset,
    }));
  const asset = images[0];
  return [
    {
      label: "调整配色",
      prompt: "基于这张图片调整整体配色，保留核心主题和构图。",
      asset,
    },
    {
      label: "修改画面文案",
      prompt: "基于这张图片优化画面中的文案与文字层级，保留整体设计方向。",
      asset,
    },
    {
      label: "继续优化细节",
      prompt: "基于这张图片继续优化画面细节和完成度，保留核心主题与构图。",
      asset,
    },
  ];
}
function ActivityStateMark({
  state,
}: {
  state: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
}) {
  if (state === "RUNNING")
    return (
      <LoaderCircle
        aria-label="执行中"
        className="size-3.5 shrink-0 animate-spin text-[var(--accent)]"
      />
    );
  if (state === "COMPLETED")
    return (
      <CheckCircle2
        aria-label="已完成"
        className="size-3.5 shrink-0 text-[var(--accent)]"
      />
    );
  return (
    <CircleStop
      aria-label={state === "CANCELLED" ? "已取消" : "未完成"}
      className="size-3.5 shrink-0 text-[var(--accent-hover)]"
    />
  );
}
function creationStatusText(status: GenerationTurn["status"]): string {
  if (status === "RUNNING") return "创作中";
  if (status === "SUCCEEDED") return "已完成";
  if (status === "CANCELLED") return "已取消";
  return "未完成";
}
function GenerationImageCard({
  image,
  onOpen,
  onRefresh,
  onFavorite,
  onPublish,
  onDelete,
}: {
  image: GenerationAsset;
  onOpen: () => void;
  onRefresh: () => Promise<GenerationAsset>;
  onFavorite: () => void;
  onPublish: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const retryUsedRef = useRef(false);
  async function retryImage(): Promise<void> {
    if (retryUsedRef.current) return setImageUnavailable(true);
    retryUsedRef.current = true;
    try {
      await onRefresh();
    } catch {
      setImageUnavailable(true);
    }
  }
  async function download(): Promise<void> {
    try {
      await downloadOriginalGenerationImage(image);
    } catch {
      setActionError("下载失败，请稍后重试。");
    }
  }
  async function copy(): Promise<void> {
    try {
      let current = image;
      if (needsImageUrlRefresh(current.imageUrls.display))
        current = await onRefresh();
      const fetchDisplay = async (asset: GenerationAsset) => {
        const url = asset.imageUrls.display?.url;
        if (!url) throw new Error("missing display");
        const response = await fetch(url, {
          mode: "cors",
          referrerPolicy: "no-referrer",
        });
        if (!response.ok) throw new Error("image fetch failed");
        return response.blob();
      };
      let blob: Blob;
      try {
        blob = await fetchDisplay(current);
      } catch {
        blob = await fetchDisplay(await onRefresh());
      }
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
        throw new Error("clipboard unavailable");
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type || "image/webp"]: blob }),
      ]);
    } catch {
      setActionError("复制失败，请使用下载。");
    }
  }
  if (!image.imageUrls.thumbnail)
    return (
      <div
        role="status"
        className="flex aspect-square flex-col items-center justify-center gap-2 rounded-[6px] border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] px-4 text-center text-xs text-[var(--text-secondary)]"
      >
        <ImageOff className="size-5" />
        图片已从资产库删除
      </div>
    );
  return (
    <div className="group relative overflow-visible rounded-[6px] border border-[var(--border)] bg-[var(--surface-bg)]">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full overflow-hidden rounded-[5px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        {imageUnavailable ? (
          <span className="flex aspect-square items-center justify-center bg-[var(--surface-soft)] text-xs text-[var(--text-secondary)]">
            图片已从资产库删除
          </span>
        ) : (
          <>
            {/* Private short-lived signed URLs must not be sent through an image optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.imageUrls.thumbnail.url}
              alt="本次生成的图片"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => void retryImage()}
              className="aspect-square w-full object-cover transition duration-200 group-hover:scale-[1.015]"
            />
          </>
        )}
      </button>
      <div className="absolute right-2 top-2 z-10 flex translate-y-1 items-center gap-1 rounded-[6px] border border-white/30 bg-[var(--primary)]/90 p-1 text-[var(--surface-bg)] opacity-0 shadow-lg transition duration-150 group-hover:translate-y-0 group-hover:opacity-100 focus-within:translate-y-0 focus-within:opacity-100">
        <button
          type="button"
          onClick={() => void download()}
          className="grid size-7 place-items-center rounded-[4px] hover:bg-white/15"
          aria-label="下载原图"
        >
          <Download className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => void copy()}
          className="grid size-7 place-items-center rounded-[4px] hover:bg-white/15"
          aria-label="复制展示图"
        >
          <Clipboard className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="grid size-7 place-items-center rounded-[4px] hover:bg-white/15"
          aria-expanded={menuOpen}
          aria-label="更多图片操作"
        >
          <Ellipsis className="size-4" />
        </button>
        {menuOpen ? (
          <div className="absolute right-0 top-[calc(100%+6px)] w-28 overflow-hidden rounded-[6px] border border-[var(--border)] bg-[var(--surface-bg)] py-1 text-[var(--primary)] shadow-xl">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onFavorite();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--surface-soft)]"
            >
              <Heart
                className={cn(
                  "size-3.5",
                  image.favorited &&
                    "fill-[var(--accent)] text-[var(--accent)]",
                )}
              />
              {image.favorited ? "取消收藏" : "收藏"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onPublish();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--surface-soft)]"
            >
              <Send className="size-3.5" />
              {image.publicationReviewStatus === "APPROVED"
                ? "查看发布"
                : "发布"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--accent-hover)] hover:bg-[var(--accent-soft)]"
            >
              <Trash2 className="size-3.5" />
              删除
            </button>
          </div>
        ) : null}
      </div>
      {actionError ? (
        <p
          role="status"
          className="absolute inset-x-1 bottom-1 rounded-[4px] bg-[var(--primary)]/85 px-2 py-1 text-center text-[10px] text-white"
        >
          {actionError}
        </p>
      ) : null}
    </div>
  );
}
function ConversationAssetActions({
  asset,
  isFavoriteUpdating,
  isDeleting,
  onFavorite,
  onPublish,
  onDelete,
}: {
  asset: GenerationAsset;
  isFavoriteUpdating: boolean;
  isDeleting: boolean;
  onFavorite: () => void;
  onPublish: () => void;
  onDelete: () => void;
}) {
  return (
    <section>
      <p className="text-xs font-medium tracking-wide text-muted-foreground">
        作品操作
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onFavorite}
          disabled={isFavoriteUpdating}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          <Heart
            className={cn(
              "size-4",
              asset.favorited && "fill-current text-[var(--accent)]",
            )}
          />
          {asset.favorited ? "已收藏" : "收藏"}
        </button>
        <button
          type="button"
          onClick={onPublish}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium hover:bg-muted"
        >
          <Send className="size-4" />
          {asset.publicationReviewStatus === "APPROVED" ? "查看发布" : "发布"}
        </button>
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={isDeleting}
        className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-destructive/10 text-sm font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"
      >
        <Trash2 className="size-4" />
        删除图片
      </button>
    </section>
  );
}
function WorkspaceDecorations() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 select-none"
    >
      <span className="absolute right-[7%] top-[94px] hidden h-[390px] w-[290px] bg-[var(--active-bg)] lg:block" />
      <div className="absolute left-[13%] top-[150px] hidden h-[57px] w-[109px] lg:block">
        <DotMatrix
          columns={5}
          rows={5}
          dotSize={3}
          gap={7}
          opacity={0.55}
          className="absolute left-0 top-0"
        />
        <AccentSquare size={17} className="absolute bottom-0 right-0" />
      </div>
    </div>
  );
}
function ArchiveLine({ label }: { label: string }) {
  return (
    <div
      aria-hidden="true"
      className="relative z-0 mt-auto hidden items-center gap-[14px] pb-[58px] pt-8 lg:flex"
    >
      <span className="size-2 shrink-0 bg-[var(--text-secondary)]" />
      <span className="h-px flex-1 bg-[var(--border-strong)]" />
      <span className="shrink-0 whitespace-nowrap text-[10px] font-medium tracking-[0.18em] text-[var(--text-secondary)]">
        {label}
      </span>
      <span className="size-2 shrink-0 bg-[var(--accent)]" />
    </div>
  );
}
function ConversationArchiveLine() {
  return (
    <div aria-hidden="true" className="my-6 flex items-center gap-3">
      <span className="h-px flex-1 bg-[var(--border-strong)]" />
      <span className="whitespace-nowrap text-[10px] font-medium tracking-[0.18em] text-[var(--text-secondary)]">
        CREATED FROM YOUR IDEA
      </span>
      <span className="size-2 bg-[var(--accent)]" />
      <span className="h-px flex-1 bg-[var(--border-strong)]" />
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
  return (
    <div className="h-[52px] animate-pulse rounded-[7px] bg-[var(--skeleton-light)]" />
  );
}
