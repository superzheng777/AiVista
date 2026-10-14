"use client";

import { X } from "lucide-react";
import { type UserAgreementPolicy } from "../api/auth-api";

export function UserAgreementDialog({ policy, onClose }: { policy: UserAgreementPolicy; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-10 grid place-items-center bg-[var(--overlay)] p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-agreement-title"
        className="w-full max-w-lg rounded-[10px] border border-[var(--border)] bg-[var(--surface-bg)] p-5 shadow-xl"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="user-agreement-title" className="text-base font-semibold text-[var(--primary)]">
            用户协议
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭用户协议"
            className="grid size-8 place-items-center rounded-[6px] text-[var(--text-secondary)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-4 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-[7px] bg-[var(--surface-soft)] p-4 text-sm leading-6 text-[var(--text-secondary)]">
          {policy.policyContent}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 h-10 w-full rounded-[7px] bg-[var(--primary)] text-sm font-medium text-[var(--surface-bg)] transition hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-bg)]"
        >
          我已阅读
        </button>
      </section>
    </div>
  );
}
