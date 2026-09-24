"use client";

import { TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";

type LogoutConfirmDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

export function LogoutConfirmDialog({ isOpen, onClose, onConfirm }: LogoutConfirmDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  async function handleConfirm() {
    setIsSubmitting(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !isSubmitting) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-dialog-title"
        className="w-full max-w-[30rem] rounded-[10px] border border-[var(--border)] bg-[var(--surface-bg)] p-5 shadow-[0_24px_70px_-30px_var(--shadow)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <TriangleAlert className="size-5 shrink-0 text-amber-500" fill="currentColor" strokeWidth={2.5} />
              <h1 id="logout-dialog-title" className="text-base font-semibold text-card-foreground">
                确认退出登录？
              </h1>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              退出登录不会丢失任何数据，你仍可以登录此账号。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="关闭退出确认窗口"
            className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-[6px] text-[var(--text-secondary)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X className="size-[1.125rem]" />
          </button>
        </div>
        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-9 rounded-[7px] border border-[var(--border)] px-4 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={isSubmitting}
            className="h-9 rounded-[7px] bg-destructive px-4 text-sm font-medium text-white transition hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-bg)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "退出中…" : "退出登录"}
          </button>
        </div>
      </section>
    </div>
  );
}
