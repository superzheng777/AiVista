"use client";

import type { GenerationAsset } from "@/entities/image-resource/model/image-resource";
import { useUserEventStreamStore } from "@/entities/user-event-stream/model/user-event-stream-store";
import { useAuthDialogStore } from "@/features/auth/model/auth-dialog-store";
import { useAuthStore } from "@/features/auth/model/auth-store";
import {
  getUserAgreementConsent,
  userAgreementQueryKeys,
} from "@/features/user-agreement/api/user-agreement-consent-api";
import { useUserAgreementConsent } from "@/features/user-agreement/model/use-user-agreement-consent";
import { UserAgreementConsentDialog } from "@/features/user-agreement/ui/user-agreement-consent-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, Image, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import {
  createAgentCreation,
  createGenerationTask,
  generationQueryKeys,
  type CreatedCreation,
} from "../api/generation-api";
import type { CreationSubmission, SubmissionFeedback } from "../model/creation-submission";
import { feedbackFromCreateError, submissionOf } from "../model/creation-submission";
import { generationFormSchema, type GenerationFormValues } from "../model/generation-form";
import { insertCreatedTurn } from "../model/session-events";
import type { GenerationSelectOption } from "./generation-composer-controls";
import { GenerationSelect, GenerationSubmitButton, GenerationToolbarControl } from "./generation-composer-controls";
import { GenerationComposerSettings } from "./generation-composer-settings";
import { GenerationReferenceImagePicker, GenerationReferenceImages } from "./generation-reference-images";

type GenerationComposerProps = {
  sessionId?: string;
  compact?: boolean;
  onExpand?: () => void;
  hasActiveCreation?: boolean;
};

type GenerationMode = GenerationFormValues["mode"];

const GENERATION_MODE_STORAGE_KEY = "aivista.generation-mode";

const generationModeOptions: readonly [GenerationSelectOption, ...GenerationSelectOption[]] = [
  { value: "image", label: "图片生成", icon: Image },
  { value: "agent", label: "Agent 模式", icon: Bot },
];

export function GenerationComposer({
  sessionId,
  compact = false,
  onExpand,
  hasActiveCreation = false,
}: GenerationComposerProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const status = useAuthStore((state) => state.status);
  const openAuthDialog = useAuthDialogStore((state) => state.open);
  const [showOptions, setShowOptions] = useState(false);
  const [openSelect, setOpenSelect] = useState<"mode" | null>(null);
  const [referenceMenuOpen, setReferenceMenuOpen] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<SubmissionFeedback | null>(null);
  const [referenceImages, setReferenceImages] = useState<GenerationAsset[]>([]);
  const controlsRef = useRef<HTMLDivElement>(null);
  const optionsTriggerRef = useRef<HTMLButtonElement>(null);
  const form = useForm<GenerationFormValues>({
    resolver: zodResolver(generationFormSchema),
    defaultValues: {
      mode: "image",
      prompt: "",
      negativePrompt: "",
      aspectRatio: "1:1",
      promptExtend: true,
      imageCount: 1,
      agentAspectRatio: "AUTO",
      agentImageCount: 0,
    },
  });
  const { setValue } = form;
  const mode = useWatch({ control: form.control, name: "mode" });
  const agentAspectRatio = useWatch({ control: form.control, name: "agentAspectRatio" });
  const agentImageCount = useWatch({ control: form.control, name: "agentImageCount" });

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
      insertCreatedTurn(queryClient, task);
      useUserEventStreamStore.getState().syncCreations([task.turn.creationId]);
      void queryClient.invalidateQueries({ queryKey: generationQueryKeys.sessions() });
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
    const storedMode = window.sessionStorage.getItem(GENERATION_MODE_STORAGE_KEY);
    if (storedMode !== "image" && storedMode !== "agent") return;
    let active = true;
    queueMicrotask(() => {
      if (active) setValue("mode", storedMode);
    });
    return () => {
      active = false;
    };
  }, [setValue]);

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
    const submission = submissionOf(values, inputAssetIds, sessionId);
    createTask.mutate(submission);
  }

  const isCheckingConsent = status === "authenticated" && consentQuery.isLoading;
  const isSubmitting = createTask.isPending || confirmConsent.isPending;
  const isSubmitDisabled = isSubmitting || isCheckingConsent || hasActiveCreation;
  const submitLabel = isSubmitting ? "正在创建生成任务" : "开始生成";

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
          placeholder="描述你的创作想法，让灵感成为画面…"
          onFocus={onExpand}
          onInput={(event) => {
            event.currentTarget.style.height = "auto";
            event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 240)}px`;
          }}
          className={
            compact
              ? "h-[58px] w-full resize-none overflow-hidden bg-transparent px-6 py-0 pr-16 text-base leading-[58px] text-[var(--primary)] outline-none placeholder:text-[var(--placeholder)] disabled:cursor-not-allowed disabled:opacity-60"
              : "min-h-[104px] max-h-[240px] w-full resize-none overflow-y-auto bg-transparent px-6 pb-[18px] pt-5 text-base leading-7 text-[var(--primary)] outline-none placeholder:text-[var(--placeholder)] disabled:cursor-not-allowed disabled:opacity-60 sm:px-[26px]"
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
          <div className="flex min-h-16 flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-4 py-2 sm:flex-nowrap">
            <div ref={controlsRef} className="flex min-w-0 flex-wrap items-center gap-1">
              <div className="shrink-0">
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
                    form.setValue("mode", selected, { shouldDirty: true, shouldValidate: true });
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
                  <Settings2 className="size-4 text-[var(--accent-hover)]" />
                  <span>设置</span>
                </GenerationToolbarControl>
                {showOptions ? (
                  <GenerationComposerSettings
                    form={form}
                    mode={mode}
                    agentAspectRatio={agentAspectRatio}
                    aspectRatio={aspectRatio}
                    agentImageCount={agentImageCount}
                    imageCount={imageCount}
                    negativePrompt={negativePrompt}
                    isSubmitDisabled={isSubmitDisabled}
                  />
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
                    className="w-9 px-0 text-sm font-semibold text-[var(--accent)]"
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
