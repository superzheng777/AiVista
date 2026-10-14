"use client";

import { profileFormSchema, type ProfileFormValues } from "@/features/public-user/model/profile-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check } from "lucide-react";
import { useForm } from "react-hook-form";

export function ProfileEditForm({
  nickname,
  bio,
  error,
  saving,
  onSave,
  onCancel,
}: {
  nickname: string;
  bio: string;
  error: string;
  saving: boolean;
  onSave: (values: ProfileFormValues) => void;
  onCancel: () => void;
}) {
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { nickname, bio },
  });

  return (
    <form
      className="mt-4 max-w-xl space-y-3 border-t border-[var(--border)] pt-4"
      onSubmit={form.handleSubmit(onSave)}
      noValidate
    >
      <input
        aria-label="昵称"
        {...form.register("nickname")}
        maxLength={32}
        className="h-10 w-full rounded-[7px] border border-[var(--border-strong)] bg-[var(--surface-bg)] px-3 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
      />
      {form.formState.errors.nickname ? (
        <p role="alert" className="text-xs text-destructive">
          {form.formState.errors.nickname.message}
        </p>
      ) : null}
      <textarea
        aria-label="个人简介"
        {...form.register("bio")}
        maxLength={500}
        rows={3}
        className="w-full rounded-[7px] border border-[var(--border-strong)] bg-[var(--surface-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
      />
      {form.formState.errors.bio ? (
        <p role="alert" className="text-xs text-destructive">
          {form.formState.errors.bio.message}
        </p>
      ) : null}
      {error ? <p className="text-sm text-[var(--accent)]">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="h-9 rounded-[7px] border border-[var(--text-secondary)] px-3 text-sm text-[var(--primary)]"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-9 items-center gap-1 rounded-[7px] bg-[var(--primary)] px-3 text-sm text-[var(--surface-bg)] disabled:opacity-60"
        >
          <Check className="size-3.5" />
          保存
        </button>
      </div>
    </form>
  );
}
