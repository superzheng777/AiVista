"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Send, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { UserAgreementConsentDialog } from "@/components/ui/user-agreement-consent-dialog";
import {
  createGenerationTask,
  generationQueryKeys,
  type CreateGenerationTaskInput,
} from "@/features/generation/api/generation-api";
import {
  aspectRatioOptions,
  generationFormSchema,
  type GenerationFormValues,
} from "@/features/generation/model/generation-form";
import { useAuthDialog } from "@/features/auth/model/auth-dialog-provider";
import { useSession } from "@/features/auth/model/session-provider";
import { useGenerationEventStream } from "@/features/generation/model/generation-event-stream-provider";
import { getApiErrorCode } from "@/shared/api/api-response";
import {
  getUserAgreementConsent,
  userAgreementQueryKeys,
} from "@/shared/api/user-agreement-consent-api";
import { useUserAgreementConsent } from "@/shared/api/use-user-agreement-consent";

type GenerationComposerProps = {
  sessionId?: string;
  hasActiveTask?: boolean;
  compact?: boolean;
  onExpand?: () => void;
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

export function GenerationComposer({ sessionId, hasActiveTask = false, compact = false, onExpand }: GenerationComposerProps) {
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
  const { consentQuery, confirmConsent } = useUserAgreementConsent(
    status === "authenticated",
    () => {
      setShowConsent(false);
      void submitTask(true);
    },
  );
  const createTask = useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: CreateGenerationTaskInput; idempotencyKey: string }) =>
      createGenerationTask(input, idempotencyKey),
    onSuccess: (task) => {
      pendingSubmission.current = null;
      window.sessionStorage.removeItem(PENDING_SUBMISSION_STORAGE_KEY);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: generationQueryKeys.sessions() }),
        queryClient.invalidateQueries({ queryKey: generationQueryKeys.messages(task.sessionId) }),
      ]);
      router.push(`/generate?sessionId=${encodeURIComponent(task.sessionId)}`);
    },
    onError: (error) => {
      const apiErrorCode = getApiErrorCode(error);
      const feedback = feedbackFromCreateError(error);
      if (feedback.clearPendingSubmission || apiErrorCode !== null) {
        pendingSubmission.current = null;
        window.sessionStorage.removeItem(PENDING_SUBMISSION_STORAGE_KEY);
      }
      setSubmitFeedback(feedback);
      if (feedback.requiresConsent) {
        void queryClient.fetchQuery({
          queryKey: userAgreementQueryKeys.consent(),
          queryFn: getUserAgreementConsent,
          retry: false,
        }).then(() => setShowConsent(true));
      }
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
      <form onSubmit={(event) => { event.preventDefault(); void submitTask(); }} className={compact ? "relative overflow-hidden rounded-full border border-[#d9cfbf] bg-[#fffdf7] shadow-[0_2px_4px_rgb(43_35_25_/_3%),0_16px_36px_rgb(43_35_25_/_6%)]" : "relative overflow-hidden rounded-[30px] border border-[#d9cfbf] bg-[#fffdf7] shadow-[0_2px_4px_rgb(43_35_25_/_3%),0_16px_36px_rgb(43_35_25_/_6%)] before:absolute before:left-9 before:top-0 before:z-10 before:h-[3px] before:w-[130px] before:bg-[#c95f3f]"}>
        <label htmlFor="generation-prompt" className="sr-only">创作提示</label>
        <textarea
          id="generation-prompt"
          rows={1}
          disabled={isSubmitDisabled}
          placeholder="描述你想生成的图片，例如：云海上的未来城市，日落，电影感"
          onFocus={onExpand}
          onInput={(event) => {
            event.currentTarget.style.height = "auto";
            event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 240)}px`;
          }}
          className={compact ? "h-[58px] w-full resize-none overflow-hidden bg-transparent px-6 py-0 pr-16 text-base leading-[58px] text-[#171612] outline-none placeholder:text-[#8c8377] disabled:cursor-not-allowed disabled:opacity-60" : "min-h-24 max-h-[240px] w-full resize-none overflow-y-auto bg-transparent px-6 pb-[18px] pt-6 text-base leading-7 text-[#171612] outline-none placeholder:text-[#8c8377] disabled:cursor-not-allowed disabled:opacity-60 sm:px-[26px] sm:pt-[26px]"}
          {...form.register("prompt")}
        />
        {compact ? <button type="submit" disabled={isSubmitDisabled} aria-label={hasActiveTask ? "当前会话正在生成" : isPreparingStream ? "正在建立实时连接" : isSubmitting ? "正在创建生成任务" : "开始生成"} className="absolute right-2 top-1/2 z-10 inline-flex size-[42px] -translate-y-1/2 items-center justify-center rounded-full bg-[#171612] text-[#fffdf7] transition hover:bg-[#302e28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c95f3f] disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting || isCheckingConsent ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}</button> : null}
        {form.formState.errors.prompt && !compact ? <p role="alert" className="px-6 pb-3 text-sm text-destructive">{form.formState.errors.prompt.message}</p> : null}

        {showOptions && !compact ? (
          <div className="grid gap-3 border-t border-[#d9cfbf] bg-[#faf5eb] px-5 py-4 sm:grid-cols-3">
            <label className="grid gap-1.5 text-sm font-medium text-[#171612]">
              画幅比例
              <select {...form.register("aspectRatio")} disabled={isSubmitDisabled} className="h-10 rounded-[6px] border border-[#bfb3a2] bg-[#fffdf7] px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-[#c95f3f]">
                {aspectRatioOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-[#171612]">
              生成数量
              <select {...form.register("imageCount", { valueAsNumber: true })} disabled={isSubmitDisabled} className="h-10 rounded-[6px] border border-[#bfb3a2] bg-[#fffdf7] px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-[#c95f3f]">
                {[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count} 张</option>)}
              </select>
            </label>
            <label className="flex min-h-10 items-center justify-between gap-3 rounded-[6px] border border-[#bfb3a2] bg-[#fffdf7] px-3 text-sm font-medium text-[#171612]">
              <span>提示词优化</span>
              <input type="checkbox" {...form.register("promptExtend")} disabled={isSubmitDisabled} className="size-4 accent-[#c95f3f]" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-[#171612] sm:col-span-3">
              负面提示词 <span className="font-normal text-[#716b61]">（可选）</span>
              <input {...form.register("negativePrompt")} disabled={isSubmitDisabled} className="h-10 rounded-[6px] border border-[#bfb3a2] bg-[#fffdf7] px-3 text-sm font-normal outline-none placeholder:text-[#8c8377] focus-visible:ring-2 focus-visible:ring-[#c95f3f]" placeholder="例如：模糊、低清晰度" />
            </label>
            {form.formState.errors.negativePrompt ? <p role="alert" className="text-sm text-destructive sm:col-span-3">{form.formState.errors.negativePrompt.message}</p> : null}
          </div>
        ) : null}

        {!compact ? <div className="flex min-h-[88px] flex-wrap items-center justify-between gap-3 border-t border-[#d9cfbf] px-4 py-3 sm:flex-nowrap sm:px-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-[14px]">
            <span className="whitespace-nowrap rounded-[6px] border border-[#bfb3a2] px-3 py-2 text-sm text-[#171612] sm:px-4">文字生图</span>
            <span className="whitespace-nowrap rounded-[6px] border border-[#bfb3a2] px-3 py-2 text-sm text-[#171612] sm:px-4">1–6 张结果</span>
            <button type="button" onClick={() => setShowOptions((value) => !value)} aria-label="更多生成选项" className="inline-flex h-[42px] shrink-0 items-center justify-center gap-2 rounded-[6px] px-3 text-sm text-[#171612] transition hover:bg-[#f7e3d4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c95f3f]">
              <Settings2 className="size-[19px]" />
              <span>更多选项</span>
            </button>
          </div>
          <div className="relative mr-2 shrink-0">
            <span aria-hidden="true" className="absolute -bottom-2.5 -right-2.5 size-[38px] rounded-[3px] bg-[#c95f3f]" />
            <button type="submit" disabled={isSubmitDisabled} aria-label={hasActiveTask ? "当前会话正在生成" : isPreparingStream ? "正在建立实时连接" : isSubmitting ? "正在创建生成任务" : "开始生成"} className="relative z-10 inline-flex size-[52px] shrink-0 items-center justify-center rounded-[7px] bg-[#171612] text-[#fffdf7] transition hover:bg-[#302e28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c95f3f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
              {isSubmitting || isCheckingConsent ? <LoaderCircle className="size-5 animate-spin" /> : <Send className="size-5" />}
            </button>
          </div>
        </div> : null}
        {submitFeedback ? <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-[#fffdf7] px-6 pb-4 text-sm text-destructive"><span>{submitFeedback.message}</span>{submitFeedback.retryable ? <button type="button" onClick={() => void submitTask()} className="font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c95f3f]">重试</button> : null}</div> : null}
      </form>

      {showConsent && consentQuery.data ? (
        <UserAgreementConsentDialog
          consent={consentQuery.data}
          isConfirming={confirmConsent.isPending}
          error={confirmConsent.error ? "确认失败，请稍后重试。" : undefined}
          eyebrow="开始生成前"
          title="确认第三方数据处理规则"
          confirmLabel="同意并生成"
          onConfirm={(policyVersion) => confirmConsent.mutate(policyVersion)}
          onDismiss={() => setShowConsent(false)}
        />
      ) : null}
    </>
  );
}
