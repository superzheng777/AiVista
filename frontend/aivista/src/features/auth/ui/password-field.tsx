"use client";

import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { type UseFormRegisterReturn } from "react-hook-form";

export function PasswordField({
  label,
  registration,
  error,
  autoComplete,
  placeholder,
  isVisible,
  onToggleVisibility,
}: {
  label: string;
  registration: UseFormRegisterReturn;
  error?: string;
  autoComplete: "current-password" | "new-password";
  placeholder: string;
  isVisible: boolean;
  onToggleVisibility: () => void;
}) {
  const VisibilityIcon = isVisible ? EyeOff : Eye;
  const toggleLabel = isVisible ? "隐藏密码" : "显示密码";

  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <span className="relative block">
        <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          {...registration}
          type={isVisible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={8}
          maxLength={64}
          className="h-11 w-full rounded-[7px] border border-[var(--border)] bg-[var(--surface-bg)] py-2 pl-10 pr-10 text-sm text-[var(--primary)] outline-none transition placeholder:text-[var(--placeholder)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-border)]"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={onToggleVisibility}
          aria-label={toggleLabel}
          className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-[6px] text-[var(--text-secondary)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <VisibilityIcon className="size-4" />
        </button>
      </span>
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </label>
  );
}
