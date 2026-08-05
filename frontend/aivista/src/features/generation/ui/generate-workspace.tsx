"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FolderClock, ImageIcon, ImageOff, LoaderCircle, MessageSquare, PencilLine, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { useEffect, useRef, useState } from "react";

import type { GenerationMessage, GenerationSession, GenerationTask } from "@/entities/generation/model/generation";
import { cancelGenerationTask, getGenerationTask, generationQueryKeys, listGenerationMessages, listGenerationSessions } from "@/features/generation/api/generation-api";
import { GenerationComposer } from "@/features/generation/ui/generation-composer";
import { useGenerationEventStream, type GenerationSessionIndicator } from "@/features/generation/model/generation-event-stream-provider";
import { cn } from "@/lib/utils";
import { getApiErrorCode } from "@/shared/api/api-response";

function taskStatusText(task: Pick<GenerationTask, "status" | "retryCount" | "maxRetryCount">): string {
  const retryProgress = `${task.retryCount}/${task.maxRetryCount}`;
  if (task.status === "QUEUED" && task.retryCount > 0) return `模型调用失败，正在重试（${retryProgress}）`;
  if (task.status === "QUEUED") return "已排队，正在等待生成";
  if (task.status === "RUNNING" && task.retryCount > 0) return `正在处理中（已重试 ${retryProgress}）`;
  if (task.status === "RUNNING") return "正在处理中";
  if (task.status === "SUCCEEDED") return "生成已完成";
  if (task.status === "PARTIALLY_SUCCEEDED") return "部分图片已生成";
  if (task.status === "FAILED") return "生成失败";
  if (task.status === "CANCELLED") return "任务已取消";
  return "尚未开始生成";
}

export function GenerateWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  const taskId = searchParams.get("taskId");
  const { sessionIndicators } = useGenerationEventStream();
  const sessionsQuery = useInfiniteQuery({
    queryKey: generationQueryKeys.sessions(),
    queryFn: ({ pageParam }) => listGenerationSessions(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const sessions = sessionsQuery.data?.pages.flatMap((page) => page.items);

  function selectSession(nextSessionId: string): void {
    router.push(`/generate?sessionId=${encodeURIComponent(nextSessionId)}`);
  }

  return (
    <section className="min-h-dvh bg-muted/35">
      <div className="grid min-h-dvh lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="border-b border-border bg-card lg:border-r lg:border-b-0">
          <div className="p-4 lg:sticky lg:top-0">
            <div className="flex items-center justify-between"><p className="text-sm font-semibold text-foreground">开启创作</p><Sparkles className="size-4 text-muted-foreground" aria-hidden="true" /></div>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
              <button type="button" onClick={() => router.push("/generate")} className={cn("inline-flex min-h-10 min-w-32 items-center gap-2 rounded-lg px-3 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:flex lg:w-full", !sessionId ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><PencilLine className="size-4" />新对话</button>
              <SessionList sessions={sessions} indicators={sessionIndicators} isLoading={sessionsQuery.isLoading} isError={sessionsQuery.isError} hasNextPage={sessionsQuery.hasNextPage} isFetchingNextPage={sessionsQuery.isFetchingNextPage} activeSessionId={sessionId} onSelect={selectSession} onLoadMore={() => void sessionsQuery.fetchNextPage()} onRetry={() => void sessionsQuery.refetch()} />
            </div>
          </div>
        </aside>

        {sessionId ? <ConversationPanel sessionId={sessionId} taskId={taskId} /> : <NewConversationPanel />}
      </div>
    </section>
  );
}

function NewConversationPanel() {
  return (
    <main className="flex min-h-[calc(100dvh-8rem)] flex-col items-center justify-center px-4 py-12 pb-24 sm:px-8 lg:min-h-dvh lg:pb-12">
      <div className="w-full max-w-5xl">
        <div className="text-center"><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">你好，想创作什么？</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">写下第一个想法，提交后会自动建立创作会话。</p></div>
        <div className="mx-auto mt-10 max-w-5xl"><GenerationComposer /></div>
      </div>
    </main>
  );
}

function ConversationPanel({ sessionId, taskId }: { sessionId: string; taskId: string | null }) {
  const queryClient = useQueryClient();
  const { acknowledgeSession, sessionIndicators } = useGenerationEventStream();
  const messagesQuery = useInfiniteQuery({
    queryKey: generationQueryKeys.messages(sessionId),
    queryFn: ({ pageParam }) => listGenerationMessages(sessionId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextBefore ?? undefined,
  });
  const messages = messagesQuery.data ? [...messagesQuery.data.pages].reverse().flatMap((page) => page.items) : undefined;
  const taskQuery = useQuery({ queryKey: taskId ? generationQueryKeys.task(taskId) : ["generation", "task", "none"], queryFn: () => getGenerationTask(taskId!), enabled: Boolean(taskId) });
  const cancelTask = useMutation({
    mutationFn: cancelGenerationTask,
    onSuccess: (_task, cancelledTaskId) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: generationQueryKeys.sessions() }),
        queryClient.invalidateQueries({ queryKey: generationQueryKeys.messages(sessionId) }),
        queryClient.invalidateQueries({ queryKey: generationQueryKeys.task(cancelledTaskId) }),
      ]);
    },
    onError: (_error, cancelledTaskId) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: generationQueryKeys.sessions() }),
        queryClient.invalidateQueries({ queryKey: generationQueryKeys.messages(sessionId) }),
        queryClient.invalidateQueries({ queryKey: generationQueryKeys.task(cancelledTaskId) }),
      ]);
    },
  });
  const earliestUrlExpiryAt = messages?.flatMap((message) => message.generation.images)
    .reduce<number | null>((earliest, image) => {
      if (!image.url || !image.urlExpiresAt) {
        return earliest;
      }
      const expiresAt = Date.parse(image.urlExpiresAt);
      return Number.isNaN(expiresAt) || (earliest !== null && earliest <= expiresAt) ? earliest : expiresAt;
    }, null) ?? null;
  useEffect(() => {
    if (earliestUrlExpiryAt === null) {
      return;
    }

    const refreshAfterMs = Math.max(0, earliestUrlExpiryAt - Date.now() - 30_000);
    const timeout = window.setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: generationQueryKeys.messages(sessionId) });
    }, refreshAfterMs);
    return () => window.clearTimeout(timeout);
  }, [earliestUrlExpiryAt, queryClient, sessionId]);
  useEffect(() => {
    if (sessionIndicators[sessionId] === "COMPLETED" || sessionIndicators[sessionId] === "ATTENTION") {
      acknowledgeSession(sessionId);
    }
  }, [acknowledgeSession, sessionId, sessionIndicators]);
  const activeMessageTask = messages?.find((message) => message.generation.status === "QUEUED" || message.generation.status === "RUNNING")?.generation;
  const currentTask = !activeMessageTask || (taskQuery.data && taskQuery.data.version >= activeMessageTask.version)
    ? taskQuery.data
    : activeMessageTask;

  return (
    <main className="flex min-h-[calc(100dvh-8rem)] min-w-0 flex-col lg:h-dvh lg:min-h-0">
      <header className="flex min-h-16 items-center justify-end border-b border-border bg-card px-4 sm:px-7"><Link href="/assets" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><FolderClock className="size-4" />资产库</Link></header>
      <section aria-label="当前会话历史" className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-5xl">
          {messagesQuery.isLoading ? <HistorySkeleton /> : null}
          {messagesQuery.isError ? <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"><p>历史对话加载失败，请重试。</p><button type="button" onClick={() => void (messagesQuery.hasNextPage ? messagesQuery.fetchNextPage() : messagesQuery.refetch())} className="mt-1 font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">重试</button></div> : null}
          {messagesQuery.hasNextPage ? <div className="mb-5 flex justify-center"><button type="button" onClick={() => void messagesQuery.fetchNextPage()} disabled={messagesQuery.isFetchingNextPage} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60">{messagesQuery.isFetchingNextPage ? <LoaderCircle className="size-4 animate-spin" /> : null}加载更早的对话</button></div> : null}
          {messages?.map((message) => <ConversationMessage key={message.id} message={message} sessionId={sessionId} />)}
          {!messagesQuery.isLoading && !messages?.length && !taskQuery.data ? <div className="flex min-h-56 items-center justify-center"><p className="text-sm text-muted-foreground">这个会话还没有可展示的历史内容。</p></div> : null}
          {currentTask ? <div className="flex justify-start"><div className="w-full max-w-4xl"><TaskNotice task={currentTask} isCancelling={cancelTask.isPending} cancellationError={cancelTask.error} onCancel={() => cancelTask.mutate(currentTask.id)} /></div></div> : null}
        </div>
      </section>
      <footer className="border-t border-border bg-card px-4 py-4 pb-24 sm:px-8 lg:pb-5"><div className="mx-auto max-w-5xl"><GenerationComposer sessionId={sessionId} hasActiveTask={Boolean(activeMessageTask)} /></div></footer>
    </main>
  );
}

function SessionList({ sessions, indicators, isLoading, isError, hasNextPage, isFetchingNextPage, activeSessionId, onSelect, onLoadMore, onRetry }: { sessions: GenerationSession[] | undefined; indicators: Record<string, GenerationSessionIndicator>; isLoading: boolean; isError: boolean; hasNextPage: boolean; isFetchingNextPage: boolean; activeSessionId: string | null; onSelect: (sessionId: string) => void; onLoadMore: () => void; onRetry: () => void }) {
  return (
    <div className="flex gap-2 lg:mt-1 lg:block lg:space-y-1">
      {isLoading ? <SessionSkeleton /> : null}
      {isError ? <div role="alert" className="px-2 py-3 text-sm text-destructive"><p>会话加载失败，请重试。</p><button type="button" onClick={onRetry} className="mt-1 font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">重试</button></div> : null}
      {sessions?.map((session) => <SessionListItem key={session.id} session={session} indicator={activeSessionId === session.id ? undefined : indicators[session.id]} active={activeSessionId === session.id} onSelect={onSelect} />)}
      {hasNextPage ? <button type="button" onClick={onLoadMore} disabled={isFetchingNextPage} className="inline-flex min-h-10 min-w-36 items-center justify-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 lg:flex lg:w-full">{isFetchingNextPage ? <LoaderCircle className="size-4 animate-spin" /> : null}加载更多会话</button> : null}
      {!isLoading && !sessions?.length ? <p className="px-2 py-2 text-xs leading-5 text-muted-foreground">尚无历史会话。</p> : null}
    </div>
  );
}

function SessionListItem({ session, indicator, active, onSelect }: { session: GenerationSession; indicator?: GenerationSessionIndicator; active: boolean; onSelect: (sessionId: string) => void }) {
  const statusIndicator = indicator === "ACTIVE"
    ? <LoaderCircle aria-label="正在生成" className="ml-auto size-3.5 shrink-0 animate-spin text-sky-600" />
    : indicator === "ATTENTION"
      ? <span aria-label="生成失败或已取消" className="ml-auto size-2 shrink-0 rounded-full bg-destructive" />
      : indicator === "COMPLETED"
        ? <span aria-label="有新的生成结果" className="ml-auto size-2 shrink-0 rounded-full bg-sky-500" />
        : null;
  return <button type="button" onClick={() => onSelect(session.id)} className={cn("inline-flex min-h-10 min-w-36 items-center gap-2 rounded-lg px-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:flex lg:w-full", active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><MessageSquare className="size-4 shrink-0" /><span className="truncate">{session.title}</span>{statusIndicator}</button>;
}

function ConversationMessage({ message, sessionId }: { message: GenerationMessage; sessionId: string }) {
  return (
    <article className="border-b border-border/70 py-7 first:pt-0">
      <div className="flex justify-end" aria-label="用户消息">
        <div className="max-w-[88%] rounded-2xl rounded-br-md bg-sky-600 px-4 py-3 text-white shadow-sm sm:max-w-[72%]">
          <p className="whitespace-pre-wrap break-words text-sm leading-7">{message.prompt}</p>
          {message.negativePrompt ? <p className="mt-2 border-t border-white/20 pt-2 text-xs leading-5 text-sky-100">负面提示词：{message.negativePrompt}</p> : null}
        </div>
      </div>

      <div className="mt-5 flex justify-start" aria-label="AI 回复">
        <div className="flex w-full max-w-4xl items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sky-500 to-violet-500 text-white shadow-sm" aria-hidden="true"><Sparkles className="size-4" /></span>
          <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-border bg-card px-4 py-3 shadow-sm sm:px-5">
            <p className="text-xs font-medium text-sky-600 dark:text-sky-400">AiVista</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{taskStatusText(message.generation)}</p>
            <TaskOutcome task={message.generation} />
            {message.generation.failureMessage ? <p role="alert" className="mt-2 text-xs leading-5 text-destructive">{message.generation.failureMessage}</p> : null}
            {message.generation.images.length ? <div className="mt-4 grid max-w-3xl gap-3 sm:grid-cols-2">{message.generation.images.map((image) => <GenerationImageCard key={image.id} image={image} sessionId={sessionId} />)}</div> : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function GenerationImageCard({ image, sessionId }: { image: GenerationTask["images"][number]; sessionId: string }) {
  const queryClient = useQueryClient();
  const failedUrls = useRef(new Set<string>());

  if (!image.url) {
    return <div role="status" className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/50 px-4 text-center text-xs text-muted-foreground"><ImageOff className="size-5" aria-hidden="true" />图片已从资产库删除</div>;
  }

  return <div className="overflow-hidden rounded-xl border border-border bg-card">
    {/* Private short-lived signed URLs must not be proxied through an image optimizer. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={image.url} alt="本次生成的图片" referrerPolicy="no-referrer" onError={() => {
      if (!failedUrls.current.has(image.url!)) {
        failedUrls.current.add(image.url!);
        void queryClient.invalidateQueries({ queryKey: generationQueryKeys.messages(sessionId) });
      }
    }} className="aspect-square w-full object-cover" />
    <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground"><ImageIcon className="size-3.5" />已生成</div>
  </div>;
}

function TaskOutcome({ task }: { task: GenerationTask }) {
  const isTerminal = task.status === "SUCCEEDED" || task.status === "PARTIALLY_SUCCEEDED" || task.status === "FAILED" || task.status === "CANCELLED";
  if (!isTerminal) {
    return null;
  }

  return <p className="mt-2 text-xs leading-5 text-muted-foreground">结果：成功 {task.completedImageCount} 张 · 失败 {task.failedImageCount} 张 · 已取消 {task.cancelledImageCount} 张</p>;
}

function TaskNotice({ task, isCancelling, cancellationError, onCancel }: { task: GenerationTask; isCancelling: boolean; cancellationError: unknown; onCancel: () => void }) {
  const [isConfirmingCancellation, setIsConfirmingCancellation] = useState(false);
  const isActive = task.status === "QUEUED" || task.status === "RUNNING";
  const cancellationMessage = getApiErrorCode(cancellationError) === 40907
    ? "任务已结束，状态已刷新。"
    : cancellationError ? "取消请求未完成，请重试。" : null;

  return (
    <div className="mt-6 rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2"><CheckCircle2 className="size-4" />{isCancelling ? "正在取消任务，等待状态确认…" : taskStatusText(task)}</span>
        {isActive && !isConfirmingCancellation ? <button type="button" onClick={() => setIsConfirmingCancellation(true)} disabled={isCancelling} className="inline-flex min-h-10 items-center rounded-lg border border-sky-200 px-3 text-sm font-medium text-sky-900 transition hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-800 dark:text-sky-100">取消生成</button> : null}
      </div>
      <TaskOutcome task={task} />
      {isActive && isConfirmingCancellation ? <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-sky-200/70 pt-3 dark:border-sky-800/70"><p className="mr-auto text-xs text-sky-800 dark:text-sky-100">取消后本次任务不会继续生成。</p><button type="button" onClick={() => setIsConfirmingCancellation(false)} disabled={isCancelling} className="min-h-10 rounded-lg px-3 text-sm font-medium transition hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60">继续生成</button><button type="button" onClick={onCancel} disabled={isCancelling} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-sky-900 px-3 text-sm font-medium text-white transition hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60">{isCancelling ? <LoaderCircle className="size-4 animate-spin" /> : <X className="size-4" />}确认取消</button></div> : null}
      {cancellationMessage ? <p role="alert" className="mt-3 text-xs text-destructive">{cancellationMessage}</p> : null}
    </div>
  );
}

function HistorySkeleton() {
  return <div className="space-y-6 animate-pulse"><div className="h-5 w-4/5 rounded bg-muted" /><div className="h-64 max-w-xl rounded-xl bg-muted" /></div>;
}

function SessionSkeleton() {
  return <div className="h-10 min-w-36 animate-pulse rounded-lg bg-muted lg:w-full" />;
}
