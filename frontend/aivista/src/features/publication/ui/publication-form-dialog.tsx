"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog } from "@base-ui/react/dialog";
import { LoaderCircle, Send, X } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import { type PublicationRequestResult, submitPublication } from "@/features/publication/api/publication-api";
import { publicationFormSchema, type PublicationFormValues } from "@/features/publication/model/publication-form";
import { getApiErrorCode, getApiErrorMessage } from "@/shared/api/api-response";

function submitMessageOf(error: unknown): string {
  const code = getApiErrorCode(error);
  if (code === 50000) return "系统繁忙，请稍后重试。";
  if (code !== null) return getApiErrorMessage(error) ?? "提交失败，请稍后重试。";
  return "提交失败，请检查网络后重试。";
}

export function PublicationFormDialog({
  asset,
  onSuccess,
  onClose,
}: {
  asset: GenerationAsset;
  onSuccess: (result: PublicationRequestResult) => void;
  onClose: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<PublicationFormValues>({
    resolver: zodResolver(publicationFormSchema),
    defaultValues: { title: "", description: "" },
  });

  async function handleSubmit(values: PublicationFormValues): Promise<void> {
    setSubmitError(null);
    try {
      const result = await submitPublication(asset.id, values);
      onSuccess(result);
    } catch (error) {
      setSubmitError(submitMessageOf(error));
    }
  }

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Dialog.Root
      open
      modal
      onOpenChange={(open) => {
        if (!open && !isSubmitting) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-[var(--overlay)]" />
        <Dialog.Viewport className="fixed inset-0 z-50 grid place-items-center p-4">
          <Dialog.Popup
            aria-labelledby="publication-form-title"
            className="w-full max-w-lg rounded-[10px] border border-[var(--border)] bg-[var(--surface-bg)] p-5 shadow-[0_24px_70px_-30px_var(--shadow)] sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[var(--accent)]">提交审核</p>
                <h2 id="publication-form-title" className="mt-1 text-xl font-semibold tracking-tight">
                  发布作品
                </h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  标题和描述将发送至内容安全服务审核；审核结果可在个人中心的发布区查看。
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="grid size-10 place-items-center rounded-[6px] text-[var(--text-secondary)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="关闭发布窗口"
              >
                <X className="size-4" />
              </button>
            </div>
            <form
              className="mt-5 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void form.handleSubmit(handleSubmit)(event);
              }}
            >
              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                作品标题
                <input
                  autoComplete="off"
                  placeholder="为作品起一个标题"
                  disabled={isSubmitting}
                  className="h-11 w-full rounded-[7px] border border-[var(--border)] bg-[var(--surface-bg)] px-3 text-sm text-[var(--primary)] outline-none transition placeholder:text-[var(--placeholder)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-border)] disabled:cursor-not-allowed disabled:opacity-60"
                  {...form.register("title")}
                />
              </label>
              {form.formState.errors.title ? (
                <p role="alert" className="text-xs text-destructive">
                  {form.formState.errors.title.message}
                </p>
              ) : null}
              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                作品描述
                <textarea
                  rows={5}
                  placeholder="描述这幅作品的创作思路或主题"
                  disabled={isSubmitting}
                  className="w-full resize-none rounded-[7px] border border-[var(--border)] bg-[var(--surface-bg)] px-3 py-2 text-sm text-[var(--primary)] outline-none transition placeholder:text-[var(--placeholder)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-border)] disabled:cursor-not-allowed disabled:opacity-60"
                  {...form.register("description")}
                />
              </label>
              {form.formState.errors.description ? (
                <p role="alert" className="text-xs text-destructive">
                  {form.formState.errors.description.message}
                </p>
              ) : null}
              {submitError ? (
                <p role="alert" className="rounded-[7px] bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {submitError}
                </p>
              ) : null}
              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="h-11 rounded-[7px] px-4 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex h-11 items-center gap-2 rounded-[7px] bg-[var(--primary)] px-4 text-sm font-medium text-[var(--surface-bg)] transition hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-bg)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
                  提交审核
                </button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
