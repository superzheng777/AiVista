"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import { useSession } from "@/features/auth/model/session-provider";
import { submitPublication } from "@/features/publication/api/publication-api";
import { publicationFormSchema, type PublicationFormValues } from "@/features/publication/model/publication-form";
import {
  clearPendingPublication,
  createPublicationIdempotencyKey,
  PENDING_PUBLICATION_MAX_AGE_MS,
  readPendingPublication,
  storePendingPublication,
} from "@/features/publication/model/publication-pending";
import { getApiErrorCode } from "@/shared/api/api-response";

function submitMessageOf(error: unknown): string {
  const code = getApiErrorCode(error);
  if (code === 40906) return "本次提交标识冲突，请重新提交。";
  if (code === 50000) return "系统繁忙，请稍后重试。";
  return "提交失败，请检查网络后重试。";
}

export function PublicationFormDialog({
  asset,
  onSuccess,
  onClose,
}: {
  asset: GenerationAsset;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const { user } = useSession();
  const idempotencyKeyRef = useRef<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<PublicationFormValues>({
    resolver: zodResolver(publicationFormSchema),
    defaultValues: { title: "", description: "" },
  });

  // 结果未知恢复：打开表单时若该图片存在未过期、属于当前用户的待恢复请求，则复用其 key 并预填文案。
  useEffect(() => {
    if (!user) return;
    const pending = readPendingPublication(asset.id);
    if (pending && pending.userId === user.id
      && Date.now() - pending.createdAt <= PENDING_PUBLICATION_MAX_AGE_MS) {
      idempotencyKeyRef.current = pending.idempotencyKey;
      form.reset({ title: pending.input.title, description: pending.input.description });
    }
  }, [asset.id, form, user]);

  async function handleSubmit(values: PublicationFormValues): Promise<void> {
    if (!user) return;
    setSubmitError(null);
    const idempotencyKey = idempotencyKeyRef.current ?? createPublicationIdempotencyKey();
    idempotencyKeyRef.current = idempotencyKey;
    storePendingPublication({
      userId: user.id,
      imageId: asset.id,
      input: values,
      idempotencyKey,
      createdAt: Date.now(),
    });
    try {
      await submitPublication(asset.id, values, idempotencyKey);
      clearPendingPublication(asset.id);
      onSuccess();
    } catch (error) {
      if (getApiErrorCode(error) === 40906) {
        clearPendingPublication(asset.id);
        idempotencyKeyRef.current = createPublicationIdempotencyKey();
      }
      setSubmitError(submitMessageOf(error));
    }
  }

  const isSubmitting = form.formState.isSubmitting;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="publication-form-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
      <section className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-sky-600">提交审核</p>
            <h2 id="publication-form-title" className="mt-1 text-xl font-semibold tracking-tight">发布作品</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">标题和描述将发送至内容安全服务审核；审核结果可在个人中心的发布区查看。</p>
          </div>
          <button type="button" onClick={onClose} disabled={isSubmitting} className="grid size-10 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="关闭发布窗口"><X className="size-4" /></button>
        </div>
        <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); void form.handleSubmit(handleSubmit)(event); }}>
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            作品标题
            <input autoComplete="off" placeholder="为作品起一个标题" disabled={isSubmitting} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-sky-400 focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-60" {...form.register("title")} />
          </label>
          {form.formState.errors.title ? <p role="alert" className="text-xs text-destructive">{form.formState.errors.title.message}</p> : null}
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            作品描述
            <textarea rows={5} placeholder="描述这幅作品的创作思路或主题" disabled={isSubmitting} className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-sky-400 focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-60" {...form.register("description")} />
          </label>
          {form.formState.errors.description ? <p role="alert" className="text-xs text-destructive">{form.formState.errors.description.message}</p> : null}
          {submitError ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{submitError}</p> : null}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="h-11 rounded-xl px-4 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">取消</button>
            <button type="submit" disabled={isSubmitting} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60">
              {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
              提交审核
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
