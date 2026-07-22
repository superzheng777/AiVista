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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !isSubmitting) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-dialog-title"
        className="w-full max-w-[30rem] rounded-xl border border-border bg-card p-5 shadow-[0_24px_70px_-30px_rgba(15,23,42,0.46)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <TriangleAlert className="size-5 shrink-0 text-amber-500" fill="currentColor" strokeWidth={2.5} />
              <h1 id="logout-dialog-title" className="text-base font-semibold text-card-foreground">确认退出登录？</h1>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">退出登录不会丢失任何数据，你仍可以登录此账号。</p>
          </div>
          <button type="button" onClick={onClose} disabled={isSubmitting} aria-label="关闭退出确认窗口" className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"><X className="size-[1.125rem]" /></button>
        </div>
        <div className="mt-4 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="h-9 rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground transition hover:bg-muted disabled:opacity-50">取消</button>
          <button type="button" onClick={() => void handleConfirm()} disabled={isSubmitting} className="h-9 rounded-xl bg-rose-500 px-4 text-sm font-medium text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? "退出中…" : "退出登录"}</button>
        </div>
      </section>
    </div>
  );
}
