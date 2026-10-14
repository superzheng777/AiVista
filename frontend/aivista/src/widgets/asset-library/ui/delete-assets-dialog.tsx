"use client";

import { LoaderCircle } from "lucide-react";

export function DeleteDialog({
  count,
  isDeleting,
  onCancel,
  onConfirm,
}: {
  count: number;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-[var(--primary)]/35 p-4"
    >
      <section className="w-full max-w-sm rounded-[10px] border border-[var(--border)] bg-[var(--surface-bg)] p-6 shadow-2xl">
        <h2 className="text-lg font-semibold">删除图片？</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          将永久删除 {count} 张图片，此操作无法撤销。
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="h-9 rounded-[6px] px-3 text-sm font-medium text-[var(--text-secondary)]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex h-9 items-center gap-2 rounded-[6px] bg-[var(--accent)] px-3 text-sm font-medium text-white disabled:opacity-60"
          >
            {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : null}删除
          </button>
        </div>
      </section>
    </div>
  );
}
