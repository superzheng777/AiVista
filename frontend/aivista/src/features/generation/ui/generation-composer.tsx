"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  CircleHelp,
  Image,
  Lightbulb,
  LoaderCircle,
  RectangleHorizontal,
  RectangleVertical,
  Settings2,
  Square,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ComponentPropsWithRef, useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { UserAgreementConsentDialog } from "@/features/user-agreement/ui/user-agreement-consent-dialog";
import {
  createAgentCreation,
  createGenerationTask,
  generationQueryKeys,
  type CreateAgentCreationInput,
  type CreatedCreation,
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
} from "@/features/user-agreement/api/user-agreement-consent-api";
import { useUserAgreementConsent } from "@/features/user-agreement/model/use-user-agreement-consent";
import type { GenerationAsset } from "@/entities/generation/model/generation";
import {
  GenerationReferenceImagePicker,
  GenerationReferenceImages,
} from "@/features/generation/ui/generation-reference-images";

type GenerationComposerProps = {
  sessionId?: string;
  compact?: boolean;
  onExpand?: () => void;
  hasActiveCreation?: boolean;
  initialDraft?: GenerationComposerDraft;
};

export type GenerationComposerDraft = {
  prompt: string;
  referenceImages: GenerationAsset[];
  mode: "agent";
};

type GenerationMode = "image" | "agent";
type AgentAspectRatio = "AUTO" | GenerationFormValues["aspectRatio"];
type CreationSubmission =
  { mode: "image"; input: CreateGenerationTaskInput } | { mode: "agent"; input: CreateAgentCreationInput };

type SubmissionFeedback = {
  message: string;
  retryable: boolean;
  requiresConsent?: boolean;
};

type GenerationSelectOption = {
  value: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
};

type GenerationSelectProps = {
  ariaLabel: string;
  value: string;
  options: readonly [GenerationSelectOption, ...GenerationSelectOption[]];
  isOpen: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onSelect: (value: string) => void;
};

type GenerationChoiceOption = {
  value: string;
  label: string;
  icon?: LucideIcon;
};

type GenerationChoiceGroupProps = {
  ariaLabel: string;
  value: string;
  options: readonly GenerationChoiceOption[];
  disabled?: boolean;
  onSelect: (value: string) => void;
};

type GenerationToolbarControlProps = ComponentPropsWithRef<"button"> & {
  isActive?: boolean;
};

type GenerationSubmitButtonProps = {
  compact: boolean;
  disabled: boolean;
  isLoading: boolean;
  label: string;
};

const GENERATION_MODE_STORAGE_KEY = "aivista.generation-mode";
const generationModeOptions: readonly [GenerationSelectOption, ...GenerationSelectOption[]] = [
  { value: "image", label: "图片生成", icon: Image },
  { value: "agent", label: "Agent 模式", icon: Bot },
];
const aspectRatioIcons: Record<GenerationFormValues["aspectRatio"], LucideIcon> = {
  "1:1": Square,
  "4:3": RectangleHorizontal,
  "3:4": RectangleVertical,
  "16:9": RectangleHorizontal,
  "9:16": RectangleVertical,
};
const aspectRatioChoiceOptions: readonly GenerationChoiceOption[] = aspectRatioOptions.map((option) => ({
  value: option.value,
  label: option.value,
  icon: aspectRatioIcons[option.value],
}));
const imageCountOptions: readonly GenerationChoiceOption[] = [1, 2, 3, 4, 5, 6].map((count) => ({
  value: String(count),
  label: String(count),
}));
const agentAspectRatioOptions: readonly GenerationChoiceOption[] = [
  { value: "AUTO", label: "自动" },
  ...aspectRatioChoiceOptions,
];
const agentImageCountOptions: readonly GenerationChoiceOption[] = [{ value: "0", label: "自动" }, ...imageCountOptions];

function GenerationToolbarControl({
  children,
  className = "",
  isActive = false,
  ...buttonProps
}: GenerationToolbarControlProps) {
  return (
    <button
      {...buttonProps}
      className={`inline-flex h-[42px] items-center justify-center gap-2 rounded-[6px] border border-[var(--border-strong)] px-3 text-sm text-[var(--primary)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60 ${isActive ? "bg-[var(--active-bg)]" : "bg-[var(--surface-bg)] hover:bg-[var(--active-bg)]"} ${className}`}
    >
      {children}
    </button>
  );
}

function GenerationSubmitButton({ compact, disabled, isLoading, label }: GenerationSubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={disabled}
      aria-label={label}
      className={`z-10 inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white transition hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${compact ? "absolute right-[5px] top-1/2 -translate-y-1/2" : "mr-2"}`}
    >
      {isLoading ? <LoaderCircle className="size-5 animate-spin" /> : <ArrowUp className="size-5" strokeWidth={2.5} />}
    </button>
  );
}

function GenerationSelect({
  ariaLabel,
  value,
  options,
  isOpen,
  disabled = false,
  onToggle,
  onSelect,
}: GenerationSelectProps) {
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const SelectedIcon = selectedOption.icon;

  return (
    <span className="relative block">
      <GenerationToolbarControl
        type="button"
        disabled={disabled}
        isActive={isOpen}
        onClick={onToggle}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className="w-full justify-start text-left font-normal"
      >
        <SelectedIcon aria-hidden="true" className="size-4 shrink-0 text-[var(--accent-hover)]" />
        <span className="min-w-0 flex-1 truncate">{selectedOption.label}</span>
        <ChevronDown
          aria-hidden="true"
          className={`size-4 shrink-0 text-[var(--text-secondary)] transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </GenerationToolbarControl>
      {isOpen ? (
        <span
          role="listbox"
          aria-label={ariaLabel}
          className="absolute bottom-[calc(100%+4px)] left-0 z-30 grid w-full min-w-[180px] gap-0.5 rounded-[7px] border border-[var(--border)] bg-[var(--surface-bg)] p-1 shadow-[0_8px_18px_rgb(43_35_25_/_14%)]"
        >
          {options.map((option) => {
            const OptionIcon = option.icon;
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                onClick={() => onSelect(option.value)}
                className={`flex min-h-8 items-center gap-2 rounded-[4px] px-2 text-left text-xs transition ${option.disabled ? "cursor-not-allowed text-[var(--text-muted)] opacity-60" : isSelected ? "bg-[var(--active-bg)] text-[var(--primary)]" : "text-[var(--primary)] hover:bg-[var(--surface-hover)]"}`}
              >
                <OptionIcon aria-hidden="true" className="size-3.5 shrink-0 text-[var(--accent-hover)]" />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {isSelected ? <Check aria-hidden="true" className="size-3.5 shrink-0 text-[var(--accent)]" /> : null}
              </button>
            );
          })}
        </span>
      ) : null}
    </span>
  );
}

function GenerationChoiceGroup({ ariaLabel, value, options, disabled = false, onSelect }: GenerationChoiceGroupProps) {
  const hasIcons = options.some((option) => option.icon);
  const columns =
    options.length === 7
      ? "grid-cols-4 sm:grid-cols-7"
      : options.length === 6 && hasIcons
        ? "grid-cols-6"
        : hasIcons
          ? "grid-cols-5"
          : "grid-cols-3 sm:grid-cols-6";

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`grid overflow-hidden rounded-[7px] border border-[var(--border)] bg-[var(--surface-bg)] ${columns}`}
    >
      {options.map((option) => {
        const OptionIcon = option.icon;
        const isSelected = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onSelect(option.value)}
            className={`flex h-9 min-w-0 cursor-pointer appearance-none items-center justify-center border border-transparent text-sm shadow-none outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60 ${OptionIcon ? "gap-1.5 px-1" : "px-1"} ${isSelected ? "relative z-10 rounded-[5px] border-[var(--accent-border)] bg-[var(--active-bg)] text-[var(--primary)]" : "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-soft)]"}`}
          >
            {OptionIcon ? (
              <OptionIcon
                aria-hidden="true"
                className={`size-3.5 shrink-0 ${isSelected ? "text-[var(--accent-hover)]" : "text-[var(--text-secondary)]"}`}
              />
            ) : null}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function inputOf(values: GenerationFormValues, inputAssetIds: string[], sessionId?: string): CreateGenerationTaskInput {
  return {
    sessionId,
    prompt: values.prompt,
    inputAssetIds: inputAssetIds.length ? inputAssetIds : undefined,
    negativePrompt: values.negativePrompt || undefined,
    aspectRatio: values.aspectRatio,
    promptExtend: values.promptExtend,
    imageCount: values.imageCount,
  };
}

function submissionOf(
  mode: GenerationMode,
  values: GenerationFormValues,
  inputAssetIds: string[],
  sessionId: string | undefined,
  agentAspectRatio: AgentAspectRatio,
  agentImageCount: number,
): CreationSubmission {
  if (mode === "agent") {
    return {
      mode,
      input: {
        sessionId,
        prompt: values.prompt,
        inputAssetIds: inputAssetIds.length ? inputAssetIds : undefined,
        aspectRatio: agentAspectRatio,
        imageCount: agentImageCount,
      },
    };
  }
  return { mode, input: inputOf(values, inputAssetIds, sessionId) };
}

function feedbackFromCreateError(error: unknown): SubmissionFeedback {
  const code = getApiErrorCode(error);
  if (code === 40902 || code === 40903)
    return { message: "生成规则已更新，请重新确认后再提交。", retryable: false, requiresConsent: true };
  if (code === 40905) return { message: "未完成的生成任务已达上限，请等待其中的任务完成后再试。", retryable: true };
  if (code === 40908) return { message: "当前会话仍在创作中，请等待完成或先停止 Agent。", retryable: false };
  if (code === 42901) return { message: "今日生成图片额度已用尽，请明日再试。", retryable: false };
  if (code === 42900) return { message: "请求过于频繁，请稍后重试。", retryable: true };
  if (code === 50000) return { message: "系统繁忙，请稍后重试。", retryable: true };
  return { message: "创建任务时发生网络或服务异常，请重试。", retryable: true };
}

export function GenerationComposer({
  sessionId,
  compact = false,
  onExpand,
  hasActiveCreation = false,
  initialDraft,
}: GenerationComposerProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { status } = useSession();
  const { open: openAuthDialog } = useAuthDialog();
  const generationStream = useGenerationEventStream();
  const [showOptions, setShowOptions] = useState(false);
  const [openSelect, setOpenSelect] = useState<"mode" | null>(null);
  const [referenceMenuOpen, setReferenceMenuOpen] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<SubmissionFeedback | null>(null);
  const [isPreparingStream, setIsPreparingStream] = useState(false);
  const [referenceImages, setReferenceImages] = useState<GenerationAsset[]>(() => initialDraft?.referenceImages ?? []);
  const [mode, setMode] = useState<GenerationMode>(() => initialDraft?.mode ?? "image");
  const [agentAspectRatio, setAgentAspectRatio] = useState<AgentAspectRatio>("AUTO");
  const [agentImageCount, setAgentImageCount] = useState(0);
  const controlsRef = useRef<HTMLDivElement>(null);
  const optionsTriggerRef = useRef<HTMLButtonElement>(null);
  const form = useForm<GenerationFormValues>({
    resolver: zodResolver(generationFormSchema),
    defaultValues: {
      prompt: initialDraft?.prompt ?? "",
      negativePrompt: "",
      aspectRatio: "1:1",
      promptExtend: true,
      imageCount: 1,
    },
  });

  useEffect(() => {
    if (
      compact &&
      document.activeElement instanceof HTMLTextAreaElement &&
      document.activeElement.id === "generation-prompt"
    ) {
      document.activeElement.blur();
    }
  }, [compact]);
  const negativePrompt = useWatch({ control: form.control, name: "negativePrompt" });
  const aspectRatio = useWatch({ control: form.control, name: "aspectRatio" });
  const imageCount = useWatch({ control: form.control, name: "imageCount" });
  const { consentQuery, confirmConsent } = useUserAgreementConsent(status === "authenticated", () => {
    setShowConsent(false);
    void submitTask(true);
  });
  const createTask = useMutation({
    mutationFn: (submission: CreationSubmission): Promise<CreatedCreation> =>
      submission.mode === "agent" ? createAgentCreation(submission.input) : createGenerationTask(submission.input),
    onSuccess: (task) => {
      setSubmitFeedback(null);
      setReferenceImages([]);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: generationQueryKeys.sessions() }),
        queryClient.invalidateQueries({ queryKey: generationQueryKeys.turns(task.sessionId) }),
      ]);
      router.push(`/generate?sessionId=${encodeURIComponent(task.sessionId)}`);
    },
    onError: (error) => {
      const feedback = feedbackFromCreateError(error);
      setSubmitFeedback(feedback);
      if (feedback.requiresConsent) {
        void queryClient
          .fetchQuery({
            queryKey: userAgreementQueryKeys.consent(),
            queryFn: getUserAgreementConsent,
            retry: false,
          })
          .then(() => setShowConsent(true))
          .catch(() => {
            setSubmitFeedback({ message: "生成规则加载失败，请稍后重试。", retryable: true });
          });
      }
    },
  });

  useEffect(() => {
    if (initialDraft) return;
    const storedMode = window.sessionStorage.getItem(GENERATION_MODE_STORAGE_KEY);
    if (storedMode !== "image" && storedMode !== "agent") return;
    let active = true;
    queueMicrotask(() => {
      if (active) setMode(storedMode);
    });
    return () => {
      active = false;
    };
  }, [initialDraft]);

  useEffect(() => {
    if (!showOptions && !openSelect && !referenceMenuOpen) return;

    const closeWhenClickingAway = (event: PointerEvent) => {
      if (!controlsRef.current?.contains(event.target as Node)) {
        setShowOptions(false);
        setOpenSelect(null);
        setReferenceMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (openSelect) {
        setOpenSelect(null);
        return;
      }
      if (referenceMenuOpen) {
        setReferenceMenuOpen(false);
        return;
      }
      setShowOptions(false);
      optionsTriggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", closeWhenClickingAway);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWhenClickingAway);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openSelect, referenceMenuOpen, showOptions]);

  async function submitTask(skipConsent = false): Promise<void> {
    const isValid = await form.trigger();
    if (!isValid) {
      return;
    }

    if (status !== "authenticated") {
      openAuthDialog();
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
    const inputAssetIds = referenceImages.map((image) => image.id);
    setSubmitFeedback(null);
    setIsPreparingStream(true);
    const streamReady = await generationStream.ensureReady();
    setIsPreparingStream(false);
    if (!streamReady) {
      setSubmitFeedback({ message: "无法建立实时连接，本次生成尚未开始。", retryable: true });
      return;
    }
    const submission = submissionOf(mode, values, inputAssetIds, sessionId, agentAspectRatio, agentImageCount);
    createTask.mutate(submission);
  }

  const isCheckingConsent = status === "authenticated" && consentQuery.isLoading;
  const isSubmitting = createTask.isPending || confirmConsent.isPending || isPreparingStream;
  const isSubmitDisabled = isSubmitting || isCheckingConsent || hasActiveCreation;
  const submitLabel = isPreparingStream ? "正在建立实时连接" : isSubmitting ? "正在创建生成任务" : "开始生成";

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submitTask();
        }}
        className={
          compact
            ? "relative overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--surface-bg)] shadow-[0_2px_4px_rgb(43_35_25_/_3%),0_16px_36px_rgb(43_35_25_/_6%)]"
            : "relative overflow-visible rounded-[20px] border border-[var(--border)] bg-[var(--surface-bg)] shadow-[0_2px_4px_rgb(43_35_25_/_3%),0_16px_36px_rgb(43_35_25_/_6%)] before:absolute before:left-9 before:top-0 before:z-10 before:h-[3px] before:w-[130px] before:bg-[var(--accent)]"
        }
      >
        <label htmlFor="generation-prompt" className="sr-only">
          创作提示
        </label>
        {!compact ? (
          <GenerationReferenceImages
            value={referenceImages}
            disabled={isSubmitDisabled}
            onChange={setReferenceImages}
          />
        ) : null}
        <textarea
          id="generation-prompt"
          rows={1}
          disabled={isSubmitDisabled}
          placeholder={
            mode === "agent"
              ? "描述你的创作目标，Agent 会分析并选择合适的工具"
              : "描述你想生成的图片，例如：云海上的未来城市，日落，电影感"
          }
          onFocus={onExpand}
          onInput={(event) => {
            event.currentTarget.style.height = "auto";
            event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 240)}px`;
          }}
          className={
            compact
              ? "h-[58px] w-full resize-none overflow-hidden bg-transparent px-6 py-0 pr-16 text-base leading-[58px] text-[var(--primary)] outline-none placeholder:text-[var(--placeholder)] disabled:cursor-not-allowed disabled:opacity-60"
              : "min-h-20 max-h-[240px] w-full resize-none overflow-y-auto bg-transparent px-6 pb-[18px] pt-2 text-base leading-7 text-[var(--primary)] outline-none placeholder:text-[var(--placeholder)] disabled:cursor-not-allowed disabled:opacity-60 sm:px-[26px]"
          }
          {...form.register("prompt")}
        />
        {compact ? (
          <GenerationSubmitButton
            compact
            disabled={isSubmitDisabled}
            isLoading={isSubmitting || isCheckingConsent}
            label={submitLabel}
          />
        ) : null}
        {form.formState.errors.prompt && !compact ? (
          <p role="alert" className="px-6 pb-3 text-sm text-destructive">
            {form.formState.errors.prompt.message}
          </p>
        ) : null}

        {!compact ? (
          <div className="flex min-h-[88px] flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3 sm:flex-nowrap sm:px-4">
            <div ref={controlsRef} className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-[14px]">
              <div className="w-[148px] shrink-0">
                <GenerationSelect
                  ariaLabel="生成模式"
                  value={mode}
                  options={generationModeOptions}
                  isOpen={openSelect === "mode"}
                  onToggle={() => {
                    setOpenSelect((value) => (value === "mode" ? null : "mode"));
                    setShowOptions(false);
                    setReferenceMenuOpen(false);
                  }}
                  onSelect={(value) => {
                    const selected = value as GenerationMode;
                    setMode(selected);
                    window.sessionStorage.setItem(GENERATION_MODE_STORAGE_KEY, selected);
                    setOpenSelect(null);
                  }}
                />
              </div>
              <div className="relative z-40 shrink-0">
                <GenerationToolbarControl
                  ref={optionsTriggerRef}
                  type="button"
                  disabled={isSubmitDisabled}
                  onClick={() => {
                    setShowOptions((value) => !value);
                    setOpenSelect(null);
                    setReferenceMenuOpen(false);
                  }}
                  aria-controls="generation-options"
                  aria-expanded={showOptions}
                  isActive={showOptions}
                >
                  <Settings2 className="size-[19px] text-[var(--accent-hover)]" />
                  <span>更多设置</span>
                </GenerationToolbarControl>
                {showOptions ? (
                  <div
                    id="generation-options"
                    role="dialog"
                    aria-label="生成配置"
                    className="absolute bottom-[calc(100%+10px)] left-0 z-50 w-[min(32rem,calc(100vw-2rem))] rounded-[10px] border border-[var(--border)] bg-[var(--surface-bg)] p-3 shadow-[0_8px_18px_rgb(43_35_25_/_12%)] sm:p-4"
                  >
                    <div className="grid gap-4">
                      <section aria-labelledby="aspect-ratio-label" className="grid gap-2">
                        <div className="inline-flex items-center gap-1.5">
                          <h3 id="aspect-ratio-label" className="text-sm font-semibold text-[var(--primary)]">
                            画幅比例
                          </h3>
                          <CircleHelp aria-hidden="true" className="size-3.5 text-[var(--text-muted)]" />
                        </div>
                        <GenerationChoiceGroup
                          ariaLabel="画幅比例"
                          value={mode === "agent" ? agentAspectRatio : aspectRatio}
                          options={mode === "agent" ? agentAspectRatioOptions : aspectRatioChoiceOptions}
                          disabled={isSubmitDisabled}
                          onSelect={(value) =>
                            mode === "agent"
                              ? setAgentAspectRatio(value as AgentAspectRatio)
                              : form.setValue("aspectRatio", value as GenerationFormValues["aspectRatio"], {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                })
                          }
                        />
                      </section>

                      <section aria-labelledby="image-count-label" className="grid gap-2">
                        <div className="inline-flex items-center gap-1.5">
                          <h3 id="image-count-label" className="text-sm font-semibold text-[var(--primary)]">
                            生成数量
                          </h3>
                          <CircleHelp aria-hidden="true" className="size-3.5 text-[var(--text-muted)]" />
                        </div>
                        <GenerationChoiceGroup
                          ariaLabel="生成数量"
                          value={String(mode === "agent" ? agentImageCount : imageCount)}
                          options={mode === "agent" ? agentImageCountOptions : imageCountOptions}
                          disabled={isSubmitDisabled}
                          onSelect={(value) =>
                            mode === "agent"
                              ? setAgentImageCount(Number(value))
                              : form.setValue("imageCount", Number(value), { shouldDirty: true, shouldValidate: true })
                          }
                        />
                      </section>
                    </div>

                    {mode === "image" ? (
                      <>
                        <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 border-y border-dashed border-[var(--border)] py-3 text-[var(--primary)]">
                          <span className="grid gap-1">
                            <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                              提示词优化 <CircleHelp aria-hidden="true" className="size-3.5 text-[var(--text-muted)]" />
                            </span>
                            <span className="text-xs font-normal text-[var(--text-secondary)]">
                              优化提示词表达，提升画面质量
                            </span>
                          </span>
                          <input
                            type="checkbox"
                            {...form.register("promptExtend")}
                            disabled={isSubmitDisabled}
                            className="size-4 shrink-0 accent-[var(--accent)] disabled:cursor-not-allowed"
                          />
                        </label>

                        <label className="mt-3 grid gap-2 text-sm font-semibold text-[var(--primary)]">
                          <span className="inline-flex items-center gap-1.5">
                            负面提示词 <span className="font-normal text-[var(--text-secondary)]">（可选）</span>{" "}
                            <CircleHelp aria-hidden="true" className="size-3.5 text-[var(--text-muted)]" />
                          </span>
                          <span className="relative">
                            <textarea
                              {...form.register("negativePrompt")}
                              disabled={isSubmitDisabled}
                              rows={1}
                              maxLength={200}
                              className="min-h-12 w-full resize-y rounded-[6px] border border-[var(--border-strong)] bg-[var(--surface-bg)] px-3 pb-6 pt-2 text-sm font-normal leading-5 outline-none placeholder:text-[var(--placeholder)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                              placeholder="例如：模糊、低清晰度"
                            />
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute bottom-2 right-3 text-xs font-normal text-[var(--text-secondary)]"
                            >
                              {negativePrompt?.length ?? 0} / 200
                            </span>
                          </span>
                        </label>
                        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                          <Lightbulb aria-hidden="true" className="size-3.5 text-[var(--accent-hover)]" />
                          填写负面提示词，有助于减少不想要的内容
                        </p>
                        {form.formState.errors.negativePrompt ? (
                          <p role="alert" className="mt-2 text-xs text-destructive">
                            {form.formState.errors.negativePrompt.message}
                          </p>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <GenerationReferenceImagePicker
                value={referenceImages}
                disabled={isSubmitDisabled}
                isMenuOpen={referenceMenuOpen}
                isAuthenticated={status === "authenticated"}
                onRequireAuth={openAuthDialog}
                onChange={setReferenceImages}
                onMenuOpenChange={(open) => {
                  setReferenceMenuOpen(open);
                  if (open) {
                    setOpenSelect(null);
                    setShowOptions(false);
                  }
                }}
                renderTrigger={({ disabled, isOpen, onClick }) => (
                  <GenerationToolbarControl
                    type="button"
                    disabled={disabled}
                    isActive={isOpen}
                    onClick={onClick}
                    aria-label="添加参考图片"
                    aria-expanded={isOpen}
                    aria-haspopup="menu"
                    className="w-[42px] px-0 text-base font-semibold text-[var(--accent)]"
                  >
                    @
                  </GenerationToolbarControl>
                )}
              />
            </div>
            <GenerationSubmitButton
              compact={false}
              disabled={isSubmitDisabled}
              isLoading={isSubmitting || isCheckingConsent}
              label={submitLabel}
            />
          </div>
        ) : null}
        {submitFeedback ? (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-[var(--surface-bg)] px-6 pb-4 text-sm text-destructive"
          >
            <span>{submitFeedback.message}</span>
            {submitFeedback.retryable ? (
              <button
                type="button"
                onClick={() => void submitTask()}
                className="font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                重试
              </button>
            ) : null}
          </div>
        ) : null}
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
