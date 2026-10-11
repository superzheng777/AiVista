"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, FolderClock, PanelLeftClose, PanelLeftOpen, PencilLine, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { AccentSquare, DotMatrix } from "@/shared/ui/editorial-ornaments/editorial-ornaments";
import { BOTTOM_FOLLOW_THRESHOLD_PX, nextBottomFollowState } from "../model/conversation-scroll";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { GenerationAsset } from "@/entities/generation/model/generation";
import {
  isActiveCreation,
  mergeSessionSnapshot,
  type SessionDetail,
  type SessionSummary,
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
} from "@/features/generation/api/generation-api";
import {
  forgetSessionEvents,
  hydrateSession,
  isSessionDeleted,
  receiveCreationEvent,
} from "@/features/generation/model/session-events";
import { useShallow } from "zustand/react/shallow";
import {
  selectSessionIndicators,
  useGenerationEventStreamStore,
} from "@/features/generation/model/generation-event-stream-store";
import { GenerationComposer } from "./generation-composer";
import { ConversationTurn } from "./conversation-turn";
import { SessionHistoryItem } from "./session-history-item";
import styles from "./generate-workspace.module.css";
import { PublicationFormDialog } from "@/features/publication/ui/publication-form-dialog";

const desktopQuery = "(min-width: 1024px)";
const desktopSnapshot = () => window.matchMedia(desktopQuery).matches;
const serverDesktopSnapshot = () => true;

export function GenerateWorkspace() {
  const client = useQueryClient();
  const router = useRouter();
  const sessionId = useSearchParams().get("sessionId");
  const sessionIndicators = useGenerationEventStreamStore(useShallow(selectSessionIndicators));
  const acknowledgeSession = useGenerationEventStreamStore((state) => state.acknowledgeSession);
  const sessionsQuery = useQuery({ queryKey: generationQueryKeys.sessions(), queryFn: listGenerationSessions });
  const sessions = sessionsQuery.data;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebarId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const subscribeDesktop = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(desktopQuery);
      const update = () => {
        setDrawerOpen(false);
        onChange();
      };
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    },
    [setDrawerOpen],
  );
  const desktop = useSyncExternalStore(subscribeDesktop, desktopSnapshot, serverDesktopSnapshot);
  const sidebarExpanded = desktop ? !sidebarCollapsed : drawerOpen;
  function selectSession(nextSessionId: string) {
    setDrawerOpen(false);
    router.push(`/generate?sessionId=${encodeURIComponent(nextSessionId)}`);
  }
  async function handleSessionDeleted(deletedSessionId: string) {
    forgetSessionEvents(client, deletedSessionId);
    await Promise.all([
      client.cancelQueries({ queryKey: generationQueryKeys.sessions(), exact: true }),
      client.cancelQueries({ queryKey: generationQueryKeys.session(deletedSessionId), exact: true }),
    ]);
    client.setQueryData<SessionSummary[]>(generationQueryKeys.sessions(), (current) =>
      current?.filter((session) => session.sessionId !== deletedSessionId),
    );
    client.removeQueries({ queryKey: generationQueryKeys.session(deletedSessionId), exact: true });
    acknowledgeSession(deletedSessionId);
    if (sessionId === deletedSessionId) window.history.replaceState(null, "", "/generate");
  }

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-6 py-[30px]">
      <p className="pl-1 text-[11px] font-semibold leading-none tracking-[0.16em] text-[var(--text-secondary)]">
        <span className="text-[var(--accent)]">02</span> / CREATE
      </p>
      <div className="mt-[14px] flex items-center justify-between">
        <h1 className="text-2xl font-bold leading-tight">开启创作</h1>
        <Sparkles className="size-5 text-[var(--text-secondary)]" />
      </div>
      <button
        type="button"
        onClick={() => {
          setDrawerOpen(false);
          // This only changes client-side session selection. Next syncs search
          // params with the History API without reusing a cached route URL.
          window.history.pushState(null, "", "/generate");
        }}
        className={`${styles.control} mt-6 inline-flex h-11 w-full shrink-0 items-center gap-[10px] rounded-[7px] border border-transparent bg-[var(--accent)] px-[13px] text-left text-sm font-semibold text-[var(--surface-bg)] hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2`}
      >
        <PencilLine className="size-[18px] shrink-0" />
        新对话
      </button>
      <div className="mt-2">
        <nav aria-label="历史会话" className="space-y-1">
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
            <SessionHistoryItem
              key={session.sessionId}
              session={session}
              selected={sessionId === session.sessionId}
              indicator={sessionIndicators?.[session.sessionId]}
              onSelect={() => selectSession(session.sessionId)}
              onDeleted={handleSessionDeleted}
            />
          ))}
          {!sessionsQuery.isPending && !sessions?.length ? (
            <p className="px-2 py-2 text-xs leading-5 text-[var(--text-secondary)]">尚无历史会话。</p>
          ) : null}
        </nav>
      </div>
    </div>
  );
  const toolbar = (
    <div
      className={`${styles.toolbar} pointer-events-none fixed left-5 right-5 top-[19px] z-20 flex items-center justify-between sm:left-8 sm:right-8 md:left-[calc(88px+2rem)] lg:left-[calc(88px+var(--session-sidebar-width)+2rem)]`}
    >
      <button
        ref={toggleRef}
        type="button"
        aria-label={sidebarExpanded ? "收起会话侧栏" : "展开会话侧栏"}
        title={sidebarExpanded ? "收起会话侧栏" : "展开会话侧栏"}
        aria-expanded={sidebarExpanded}
        aria-controls={desktop ? sidebarId : `${sidebarId}-drawer`}
        onClick={() => {
          if (desktop) {
            toggleRef.current?.focus();
            setSidebarCollapsed((value) => !value);
          } else setDrawerOpen(true);
        }}
        className={`${styles.control} pointer-events-auto grid size-9 place-items-center rounded-[6px] border border-[var(--border)] bg-[var(--surface-bg)] text-[var(--text-secondary)] hover:bg-[var(--active-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]`}
      >
        {sidebarExpanded ? (
          <PanelLeftClose aria-hidden="true" className="size-4" />
        ) : (
          <PanelLeftOpen aria-hidden="true" className="size-4" />
        )}
      </button>
      <Link
        href="/assets"
        className={`${styles.control} pointer-events-auto inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface-bg)] px-3 text-sm font-medium hover:bg-[var(--active-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]`}
      >
        <FolderClock aria-hidden="true" className="size-4" />
        资产库
      </Link>
    </div>
  );
  return (
    <section
      className={`min-h-dvh overflow-x-hidden bg-[var(--page-bg)] text-[var(--primary)] ${sidebarCollapsed ? "[--session-sidebar-width:0px]" : "[--session-sidebar-width:320px]"}`}
    >
      <div className={`${styles.layout} grid min-h-dvh grid-cols-[minmax(0,1fr)] lg:h-dvh`}>
        {desktop ? (
          <aside
            id={sidebarId}
            aria-label="会话侧栏"
            aria-hidden={sidebarCollapsed}
            inert={sidebarCollapsed}
            className="hidden h-dvh min-h-0 min-w-0 overflow-hidden bg-[var(--surface-bg)] lg:block"
          >
            <div className={styles.sidebarContent}>{sidebar}</div>
          </aside>
        ) : null}
        <div key="workspace" className="min-w-0">
          {sessionId && !isSessionDeleted(client, sessionId) ? (
            <ConversationPanel key={sessionId} sessionId={sessionId} toolbar={toolbar} />
          ) : (
            <NewConversationPanel toolbar={toolbar} />
          )}
        </div>
      </div>
      <Dialog.Root open={!desktop && drawerOpen} onOpenChange={setDrawerOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={`${styles.backdrop} fixed inset-0 z-50 bg-[var(--overlay)]`} />
          <Dialog.Popup
            id={`${sidebarId}-drawer`}
            finalFocus={toggleRef}
            className={`${styles.drawer} fixed inset-y-0 left-0 z-[60] flex w-[min(320px,calc(100vw-3rem))] flex-col bg-[var(--surface-bg)] pb-[env(safe-area-inset-bottom)] shadow-xl outline-none`}
          >
            <Dialog.Title className="sr-only">会话侧栏</Dialog.Title>
            <Dialog.Close
              aria-label="收起会话侧栏"
              className={`${styles.control} absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-[6px] text-[var(--text-secondary)] hover:bg-[var(--active-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]`}
            >
              <X aria-hidden="true" className="size-4" />
            </Dialog.Close>
            {sidebar}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}

function NewConversationPanel({ toolbar }: { toolbar: ReactNode }) {
  return (
    <main className="relative flex min-h-[calc(100dvh-4rem)] min-w-0 flex-col overflow-hidden bg-[var(--page-bg)] px-5 py-16 pb-24 sm:px-8 lg:min-h-dvh lg:px-12 lg:pt-20 lg:pb-0">
      {toolbar}
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

function ConversationPanel({ sessionId, toolbar }: { sessionId: string; toolbar: ReactNode }) {
  const client = useQueryClient();
  const router = useRouter();
  const syncVersion = useGenerationEventStreamStore((state) => state.syncVersion);
  const acknowledgeSession = useGenerationEventStreamStore((state) => state.acknowledgeSession);
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
  return <div className="h-11 animate-pulse rounded-[7px] bg-[var(--skeleton-light)]" />;
}
