"use client";

import { ClipboardList } from "lucide-react";
import { type Dispatch, type SetStateAction, useState } from "react";

import type { AgentInputForm, AgentInputFormField, CreationForm } from "@/entities/generation/model/generation";
import { cn } from "@/shared/lib/cn";

export function AgentInputFormCard({
  value,
  enabled,
  submitting,
  cancelling,
  onResolve,
  onCancel,
}: {
  value: CreationForm;
  enabled: boolean;
  submitting: boolean;
  cancelling: boolean;
  onResolve: (action: "SUBMIT" | "SKIP", form: AgentInputForm | null) => void;
  onCancel: () => void;
}) {
  const [draftForm, setDraftForm] = useState<AgentInputForm>(() => cloneForm(value.form));
  const [customFieldIds, setCustomFieldIds] = useState<Set<string>>(() => initialCustomFieldIds(value.form));
  const missingRequired = draftForm.fields.some((field) => field.required && !field.value.trim());
  if (value.status !== "PENDING") {
    return (
      <section
        className="mt-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3"
        aria-label="已处理的需求确认表单"
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ClipboardList className="size-4 text-[var(--accent)]" />
          {value.form.title}
        </div>
        {value.status === "CANCELLED" ? (
          <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">本次创作已取消，此表单无需继续填写。</p>
        ) : value.status === "SKIPPED" ? (
          <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
            已跳过，Agent 将根据已有信息采用合理默认值。
          </p>
        ) : (
          <dl className="mt-2 space-y-1 text-xs leading-5 text-[var(--text-secondary)]">
            {value.form.fields.map((field) => {
              if (!field.value.trim()) return null;
              return (
                <div key={field.id} className="flex gap-1">
                  <dt className="shrink-0">{field.label}：</dt>
                  <dd className="text-[var(--primary)]">{formValueLabel(field)}</dd>
                </div>
              );
            })}
          </dl>
        )}
      </section>
    );
  }
  return (
    <section
      className="mt-3 rounded-[8px] border border-[var(--border-strong)] bg-[var(--surface-bg)] p-4"
      aria-label="需求确认表单"
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        <ClipboardList className="size-4 text-[var(--accent)]" />
        {value.form.title}
      </div>
      <div className="mt-4 space-y-5">
        {draftForm.fields.map((field) => (
          <fieldset key={field.id} disabled={!enabled || submitting || cancelling}>
            <legend className="mb-2 text-xs font-medium text-[var(--text-secondary)]">
              {field.label}
              {field.required ? <span className="ml-1 text-[var(--accent)]">*</span> : null}
            </legend>
            {field.type === "TEXT" ? (
              <input
                value={field.value}
                maxLength={300}
                placeholder={field.placeholder}
                onChange={(event) => setFieldValue(setDraftForm, field.id, event.target.value)}
                className="h-11 w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface-bg)] px-3 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-border)] disabled:cursor-not-allowed disabled:opacity-60"
              />
            ) : (
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={field.label}>
                {field.options.map((option) => {
                  const selected = !customFieldIds.has(field.id) && field.value === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        setCustomFieldSelected(setCustomFieldIds, field.id, false);
                        setFieldValue(setDraftForm, field.id, option.value);
                      }}
                      className={cn(
                        "min-h-9 rounded-[6px] border px-3 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-bg)] disabled:cursor-not-allowed disabled:opacity-60",
                        selected
                          ? "border-[var(--accent-border)] bg-[var(--active-bg)] text-[var(--primary)]"
                          : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-soft)]",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
                {field.allowCustom ? (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={customFieldIds.has(field.id)}
                    onClick={() => {
                      setCustomFieldSelected(setCustomFieldIds, field.id, true);
                      if (field.options.some((option) => option.value === field.value)) {
                        setFieldValue(setDraftForm, field.id, "");
                      }
                    }}
                    className={cn(
                      "min-h-9 rounded-[6px] border px-3 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-bg)] disabled:cursor-not-allowed disabled:opacity-60",
                      customFieldIds.has(field.id)
                        ? "border-[var(--accent-border)] bg-[var(--active-bg)] text-[var(--primary)]"
                        : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-soft)]",
                    )}
                  >
                    {field.customLabel ?? "自定义"}
                  </button>
                ) : null}
                {customFieldIds.has(field.id) ? (
                  <input
                    aria-label={`${field.label}自定义内容`}
                    value={field.value}
                    maxLength={300}
                    onChange={(event) => setFieldValue(setDraftForm, field.id, event.target.value)}
                    className="h-9 min-w-[220px] flex-1 rounded-[6px] border border-[var(--border)] bg-[var(--surface-bg)] px-3 text-xs outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-border)] disabled:cursor-not-allowed disabled:opacity-60"
                  />
                ) : null}
              </div>
            )}
          </fieldset>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          disabled={!enabled || submitting || cancelling}
          onClick={onCancel}
          className="h-9 rounded-[6px] border border-[var(--border-strong)] px-3 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-bg)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {cancelling ? "取消中" : "取消本次创作"}
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!enabled || submitting || cancelling}
            onClick={() => onResolve("SKIP", null)}
            className="h-9 rounded-[6px] bg-[var(--surface-soft)] px-4 text-xs font-medium text-[var(--primary)] transition hover:bg-[var(--active-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-bg)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            跳过
          </button>
          <button
            type="button"
            disabled={!enabled || submitting || cancelling || missingRequired}
            onClick={() => onResolve("SUBMIT", draftForm)}
            className="inline-flex h-9 items-center rounded-[6px] bg-[var(--primary)] px-5 text-xs font-semibold text-[var(--surface-bg)] transition hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-bg)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "提交中" : "确认"}
          </button>
        </div>
      </div>
      {!enabled ? (
        <p className="mt-2 text-right text-xs text-[var(--text-secondary)]">当前创作已不再等待此表单。</p>
      ) : null}
    </section>
  );
}

function cloneForm(form: AgentInputForm): AgentInputForm {
  return {
    ...form,
    fields: form.fields.map((field) =>
      field.type === "SINGLE_SELECT"
        ? { ...field, options: field.options.map((option) => ({ ...option })) }
        : { ...field },
    ),
  };
}

function initialCustomFieldIds(form: AgentInputForm): Set<string> {
  return new Set(
    form.fields
      .filter(
        (field) =>
          field.type === "SINGLE_SELECT" &&
          field.allowCustom &&
          Boolean(field.value) &&
          !field.options.some((option) => option.value === field.value),
      )
      .map((field) => field.id),
  );
}

function setFieldValue(
  setForm: Dispatch<SetStateAction<AgentInputForm>>,
  fieldId: string,
  nextValue: string,
): void {
  setForm((current) => ({
    ...current,
    fields: current.fields.map((field) => (field.id === fieldId ? { ...field, value: nextValue } : field)),
  }));
}

function setCustomFieldSelected(
  setFieldIds: Dispatch<SetStateAction<Set<string>>>,
  fieldId: string,
  selected: boolean,
): void {
  setFieldIds((current) => {
    const next = new Set(current);
    if (selected) next.add(fieldId);
    else next.delete(fieldId);
    return next;
  });
}

function formValueLabel(field: AgentInputFormField): string {
  if (field.type === "SINGLE_SELECT") {
    return field.options.find((option) => option.value === field.value)?.label ?? field.value;
  }
  return field.value;
}
