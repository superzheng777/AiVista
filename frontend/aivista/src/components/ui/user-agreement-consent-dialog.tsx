"use client";

import { LoaderCircle, X } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { UserAgreementConsent } from "@/entities/user/model/user-agreement-consent";

export function UserAgreementConsentDialog({
  consent,
  isConfirming = false,
  error,
  eyebrow = "操作前",
  title = "确认《用户协议》",
  confirmLabel = "同意并继续",
  onConfirm,
  onDismiss,
}: {
  consent: UserAgreementConsent;
  isConfirming?: boolean;
  error?: ReactNode;
  eyebrow?: string;
  title?: string;
  confirmLabel?: string;
  onConfirm: (policyVersion: string) => void;
  onDismiss: () => void;
}) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="user-agreement-consent-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
      <section className="w-full max-w-xl rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-sky-600">{eyebrow}</p>
            <h2 id="user-agreement-consent-title" className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
          </div>
          <button type="button" onClick={onDismiss} disabled={isConfirming} className="grid size-10 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="关闭协议确认窗口"><X className="size-4" /></button>
        </div>
        <div className="mt-4 max-h-56 overflow-y-auto rounded-xl bg-muted p-4 text-sm leading-6 text-muted-foreground">{consent.policyContent}</div>
        {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="ghost" onClick={onDismiss} disabled={isConfirming}>暂不操作</Button>
          <Button disabled={isConfirming} onClick={() => onConfirm(consent.policyVersion)}>
            {isConfirming ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
