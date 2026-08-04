"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Send, Settings2, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import {
  confirmGenerationConsent,
  createGenerationTask,
  generationQueryKeys,
  getGenerationConsent,
  type CreateGenerationTaskInput,
} from "@/features/generation/api/generation-api";
import {
  aspectRatioOptions,
  generationFormSchema,
  type GenerationFormValues,
} from "@/features/generation/model/generation-form";
import { useAuthDialog } from "@/features/auth/model/auth-dialog-provider";
import { useSession } from "@/features/auth/model/session-provider";
import { getApiErrorCode } from "@/shared/api/api-response";
import { useGenerationEventStream } from "@/features/generation/model/generation-event-stream-provider";

type GenerationComposerProps = {
  sessionId?: string;
  hasActiveTask?: boolean;
};

type PendingSubmission = {
  fingerprint: string;
  idempotencyKey: string;
};

type StoredPendingSubmission = PendingSubmission & {
  userId: string;
  input: CreateGenerationTaskInput;
  createdAt: number;
};

type SubmissionFeedback = {
  message: string;
  retryable: boolean;
  requiresConsent?: boolean;
  clearPendingSubmission?: boolean;
};

const PENDING_SUBMISSION_STORAGE_KEY = "aivista.pending-generation-submission";
const PENDING_SUBMISSION_MAX_AGE_MS = 10 * 60 * 1_000;

function createIdempotencyKey(): string {
  return crypto.randomUUID();
}

function fingerprintOf(values: GenerationFormValues, sessionId?: string): string {
  return JSON.stringify({ sessionId: sessionId ?? null, ...values });
}

function inputOf(values: GenerationFormValues, sessionId?: string): CreateGenerationTaskInput {
  return {
    sessionId,
    prompt: values.prompt,
    negativePrompt: values.negativePrompt || undefined,
    aspectRatio: values.aspectRatio,
    promptExtend: values.promptExtend,
    imageCount: values.imageCount,
  };
}

function readStoredPendingSubmission(): StoredPendingSubmission | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_SUBMISSION_STORAGE_KEY);
    if (!raw) return null;
    const stored: unknown = JSON.parse(raw);
    if (!stored || typeof stored !== "object") return null;
    const value = stored as Partial<StoredPendingSubmission>;
    if (typeof value.userId !== "string" || typeof value.fingerprint !== "string"
      || typeof value.idempotencyKey !== "string" || typeof value.createdAt !== "number"
      || !value.input || typeof value.input !== "object") return null;
    return value as StoredPendingSubmission;
  } catch {
    return null;
  }
}

function feedbackFromCreateError(error: unknown): SubmissionFeedback {
  const code = getApiErrorCode(error);
  if (code === 40902 || code === 40903) return { message: "生成规则已更新，请重新确认后再提交。", retryable: false, requiresConsent: true };
  if (code === 40904) return { message: "当前会话仍有生成任务，请等待完成或取消后再试。", retryable: false };
  if (code === 40905) return { message: "未完成的生成任务已达上限，请等待其中的任务完成后再试。", retryable: true };
  if (code === 40906) return { message: "本次提交标识发生冲突，请重新提交。", retryable: true, clearPendingSubmission: true };
  if (code === 42901) return { message: "今日生成图片额度已用尽，请明日再试。", retryable: false };
  if (code === 42900) return { message: "请求过于频繁，请稍后重试。", retryable: true };
  if (code === 50000) return { message: "系统繁忙，请稍后重试。", retryable: true };
  return { message: "创建任务时发生网络或服务异常，请重试。", retryable: true };
}

export function GenerationComposer({ sessionId, hasActiveTask = false }: GenerationComposerProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { status, user } = useSession();
  const { open: openAuthDialog } = useAuthDialog();
  const generationStream = useGenerationEventStream();
  const [showOptions, setShowOptions] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<SubmissionFeedback | null>(null);
  const [isPreparingStream, setIsPreparingStream] = useState(false);
  const pendingSubmission = useRef<PendingSubmission | null>(null);
  const recoveryStarted = useRef(false);
  const form = useForm<GenerationFormValues>({
    resolver: zodResolver(generationFormSchema),
    defaultValues: { prompt: "", negativePrompt: "", aspectRatio: "1:1", promptExtend: true, imageCount: 1 },
  });
  const consentQuery = useQuery({
    queryKey: generationQueryKeys.consent(),
    queryFn: getGenerationConsent,
    enabled: status === "authenticated",
  });
  const createTask = useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: CreateGenerationTaskInput; idempotencyKey: string }) =>
      createGenerationTask(input, idempotencyKey),
    onSuccess: (task) => {
      pendingSubmission.current = null;
      window.sessionStorage.removeItem(PENDING_SUBMISSION_STORAGE_KEY);
      queryClient.setQueryData(generationQueryKeys.task(task.id), {
        ...task,
        retryCount: 0,
        maxRetryCount: 0,
        completedImageCount: 0,
        failedImageCount: 0,
        cancelledImageCount: 0,
        failureCode: null,
        failureMessage: null,
        images: [],
        completedAt: null,
      });
      void queryClient.invalidateQueries({ queryKey: generationQueryKeys.sessions() });
      router.push(`/generate?sessionId=${encodeURIComponent(task.sessionId)}&taskId=${encodeURIComponent(task.id)}`);
    },
    onError: (error) => {
      const feedback = feedbackFromCreateError(error);
      if (feedback.clearPendingSubmission || getApiErrorCode(error) !== null) {
        pendingSubmission.current = null;
        window.sessionStorage.removeItem(PENDING_SUBMISSION_STORAGE_KEY);
      }
      setSubmitFeedback(feedback);
      if (feedback.requiresConsent) {
        void queryClient.fetchQuery({
          queryKey: generationQueryKeys.consent(),
          queryFn: getGenerationConsent,
        }).then(() => setShowConsent(true));
      }
    },
  });
  const confirmConsent = useMutation({
    mutationFn: confirmGenerationConsent,
    onSuccess: (consent) => {
      queryClient.setQueryData(generationQueryKeys.consent(), consent);
      setShowConsent(false);
      void submitTask(true);
    },
  });

  useEffect(() => {
    if (status !== "authenticated" || !user || recoveryStarted.current) return;
    const stored = readStoredPendingSubmission();
    if (!stored) return;
    if (stored.userId !== user.id || Date.now() - stored.createdAt > PENDING_SUBMISSION_MAX_AGE_MS) {
      window.sessionStorage.removeItem(PENDING_SUBMISSION_STORAGE_KEY);
      return;
    }

    recoveryStarted.current = true;
    pendingSubmission.current = { fingerprint: stored.fingerprint, idempotencyKey: stored.idempotencyKey };
    void (async () => {
      await Promise.resolve();
      setSubmitFeedback({ message: "检测到未确认的生成请求，正在恢复任务状态。", retryable: false });
      setIsPreparingStream(true);
      const streamReady = await generationStream.ensureReady();
      setIsPreparingStream(false);
      if (!streamReady) {
        setSubmitFeedback({ message: "无法建立实时连接，暂时无法确认上一项生成请求。", retryable: true });
        return;
      }
      createTask.mutate({ input: stored.input, idempotencyKey: stored.idempotencyKey });
    })();
  }, [createTask, generationStream, status, user]);

  async function submitTask(skipConsent = false): Promise<void> {
    const isValid = await form.trigger();
    if (!isValid) {
      return;
    }

    if (status !== "authenticated") {
      openAuthDialog();
      return;
    }
    if (!user) {
      return;
    }

    if (consentQuery.isLoading) {
      setSubmitFeedback({ message: "正在检查生成规则，请稍候。", retryable: false });
      return;
    }

    if (consentQuery.isError) {
      setSubmitFeedback({ message: "暂时无法确认生成规则，请稍后重试。", retryable: true });
      return;
    }

    if (!skipConsent && consentQuery.data && !consentQuery.data.consented) {
      setShowConsent(true);
      return;
    }

    const values = form.getValues();
    const fingerprint = fingerprintOf(values, sessionId);
    if (!pendingSubmission.current || pendingSubmission.current.fingerprint !== fingerprint) {
      pendingSubmission.current = { fingerprint, idempotencyKey: createIdempotencyKey() };
    }

    setSubmitFeedback(null);
    setIsPreparingStream(true);
    const streamReady = await generationStream.ensureReady();
    setIsPreparingStream(false);
    if (!streamReady) {
      setSubmitFeedback({ message: "无法建立实时连接，本次生成尚未开始。", retryable: true });
      return;
    }
    const input = inputOf(values, sessionId);
    window.sessionStorage.setItem(PENDING_SUBMISSION_STORAGE_KEY, JSON.stringify({
      userId: user.id,
      fingerprint,
      idempotencyKey: pendingSubmission.current.idempotencyKey,
      input,
      createdAt: Date.now(),
    } satisfies StoredPendingSubmission));
    createTask.mutate({ input, idempotencyKey: pendingSubmission.current.idempotencyKey });
  }

  const isCheckingConsent = status === "authenticated" && consentQuery.isLoading;
  const isSubmitting = createTask.isPending || confirmConsent.isPending || isPreparingStream;
  const isSubmitDisabled = hasActiveTask || isSubmitting || isCheckingConsent;

  return (
    <>
      <form onSubmit={(event) => { event.preventDefault(); void submitTask(); }} className="rounded-[1.25rem] border border-border bg-card p-3 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.4)] sm:p-4">
        <label htmlFor="generation-prompt" className="sr-only">创作提示</label>
        <textarea
          id="generation-prompt"
          rows={4}
          disabled={isSubmitDisabled}
          placeholder="描述你想生成的图片，例如：云海上的未来城市，日落，电影感"
          className="min-h-28 w-full resize-none bg-transparent px-2 py-2 text-base leading-7 text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
          {...form.register("prompt")}
        />
        {form.formState.errors.prompt ? <p role="alert" className="px-2 pb-2 text-sm text-destructive">{form.formState.errors.prompt.message}</p> : null}

        {showOptions ? (
          <div className="grid gap-3 border-t border-border px-2 py-3 sm:grid-cols-3">
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              画幅比例
              <select {...form.register("aspectRatio")} disabled={isSubmitDisabled} className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {aspectRatioOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              生成数量
              <select {...form.register("imageCount", { valueAsNumber: true })} disabled={isSubmitDisabled} className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count} 张</option>)}
              </select>
            </label>
            <label className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground">
              <span>提示词优化</span>
              <input type="checkbox" {...form.register("promptExtend")} disabled={isSubmitDisabled} className="size-4 accent-primary" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-foreground sm:col-span-3">
              负面提示词 <span className="font-normal text-muted-foreground">（可选）</span>
              <input {...form.register("negativePrompt")} disabled={isSubmitDisabled} className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-normal outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" placeholder="例如：模糊、低清晰度" />
            </label>
            {form.formState.errors.negativePrompt ? <p role="alert" className="text-sm text-destructive sm:col-span-3">{form.formState.errors.negativePrompt.message}</p> : null}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="whitespace-nowrap rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground sm:px-2.5">文字生图</span>
            <span className="whitespace-nowrap rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground sm:px-2.5">1–6 张结果</span>
            <button type="button" onClick={() => setShowOptions((value) => !value)} aria-label="更多生成选项" className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto sm:gap-1.5 sm:px-2.5">
              <Settings2 className="size-3.5" />
              <span className="hidden sm:inline">更多选项</span>
            </button>
          </div>
          <button type="submit" disabled={isSubmitDisabled} aria-label={hasActiveTask ? "当前会话正在生成" : isPreparingStream ? "正在建立实时连接" : isSubmitting ? "正在创建生成任务" : "开始生成"} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-violet-500 text-white shadow-[0_8px_18px_-8px_rgba(14,165,233,0.85)] transition hover:from-sky-600 hover:to-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
            {isSubmitting || isCheckingConsent ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </div>
        {submitFeedback ? <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 px-2 pt-3 text-sm text-destructive"><span>{submitFeedback.message}</span>{submitFeedback.retryable ? <button type="button" onClick={() => void submitTask()} className="font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">重试</button> : null}</div> : null}
      </form>

      {showConsent && consentQuery.data ? (
        <div role="dialog" aria-modal="true" aria-labelledby="generation-consent-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
          <section className="w-full max-w-xl rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-sky-600">开始生成前</p>
                <h2 id="generation-consent-title" className="mt-1 text-xl font-semibold tracking-tight">确认第三方数据处理规则</h2>
              </div>
              <button type="button" onClick={() => setShowConsent(false)} className="grid size-10 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="关闭规则确认窗口"><X className="size-4" /></button>
            </div>
            <div className="mt-4 max-h-56 overflow-y-auto rounded-xl bg-muted p-4 text-sm leading-6 text-muted-foreground">{consentQuery.data.policyContent}</div>
            {confirmConsent.error ? <p role="alert" className="mt-3 text-sm text-destructive">确认失败，请稍后重试。</p> : null}
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setShowConsent(false)} className="min-h-11 rounded-xl px-4 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">暂不生成</button>
              <button type="button" disabled={confirmConsent.isPending} onClick={() => confirmConsent.mutate(consentQuery.data.policyVersion)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60">
                {confirmConsent.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                同意并生成
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
