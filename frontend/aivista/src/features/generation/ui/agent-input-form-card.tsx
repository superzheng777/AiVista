"use client";

import { ChevronRight, ClipboardList } from "lucide-react";
import { type Dispatch, type SetStateAction, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import type { AgentInputForm, AgentInputFormField } from "@/entities/generation/model/generation";
import type { SessionFormItem } from "@/entities/generation/model/session";
import { agentInputValuesSchema } from "@/features/generation/model/agent-input-form";
import { cn } from "@/shared/lib/cn";

export function AgentInputFormCard({
  value,
  enabled,
  submitting,
  cancelling,
  onResolve,
  onCancel,
}: {
  value: SessionFormItem;
  enabled: boolean;
  submitting: boolean;
  cancelling: boolean;
  onResolve: (action: "SUBMIT" | "SKIP", form: AgentInputForm | null) => void;
  onCancel: () => void;
}) {
  const form = useForm<{ values: string[] }>({
    resolver: zodResolver(agentInputValuesSchema(value)),
    defaultValues: { values: value.fields.map((field) => field.value) },
    mode: "onChange",
  });
  const values = useWatch({ control: form.control, name: "values" });
  const [customFieldIds, setCustomFieldIds] = useState<Set<string>>(() => initialCustomFieldIds(value));
  const missingRequired = value.fields.some((field, index) => field.required && !(values[index] ?? "").trim());
  if (value.status !== "PENDING") {
    return (
      <details
        className="group mt-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2"
        aria-label="已处理的需求确认表单"
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-normal text-[var(--accent)]">
          <ClipboardList className="size-4 shrink-0" />
          <span className="flex min-w-0 items-center gap-1">
            <span className="min-w-0 break-words">{value.title}</span>
            <ChevronRight
              aria-hidden="true"
              className="size-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none"
            />
          </span>
        </summary>
        <div className="mt-2 border-t border-[var(--border)] pt-2 text-xs leading-5 text-[var(--text-secondary)]">
          {value.status === "CANCELLED" ? (
            <p>本次创作已取消，此表单无需继续填写。</p>
          ) : value.status === "SKIPPED" ? (
            <p>已跳过，Agent 将根据已有信息采用合理默认值。</p>
          ) : (
            <dl className="space-y-1">
              {value.fields.map((field) => {
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
        </div>
      </details>
    );
  }
  return (
    <form
      onSubmit={form.handleSubmit(({ values }) =>
        onResolve("SUBMIT", {
          schemaVersion: value.schemaVersion,
          title: value.title,
          fields: value.fields.map((field, index) => ({ ...field, value: values[index] ?? "" })),
        }),
      )}
      className="mt-3 rounded-[8px] border border-[var(--border-strong)] bg-[var(--surface-bg)] p-4"
      aria-label="需求确认表单"
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        <ClipboardList className="size-4 text-[var(--accent)]" />
        {value.title}
      </div>
      <div className="mt-4 space-y-5">
        {value.fields.map((field, index) => (
          <fieldset key={field.id} disabled={!enabled || submitting || cancelling}>
            <legend className="mb-2 text-xs font-medium text-[var(--text-secondary)]">
              {field.label}
              {field.required ? <span className="ml-1 text-[var(--accent)]">*</span> : null}
            </legend>
            {field.type === "TEXT" ? (
              <input
                aria-label={field.label}
                {...form.register(`values.${index}`)}
                maxLength={300}
                placeholder={field.placeholder}
                className="h-11 w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface-bg)] px-3 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-border)] disabled:cursor-not-allowed disabled:opacity-60"
              />
            ) : (
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={field.label}>
                {field.options.map((option) => {
                  const selected = !customFieldIds.has(field.id) && values[index] === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        setCustomFieldSelected(setCustomFieldIds, field.id, false);
                        form.setValue(`values.${index}`, option.value, { shouldDirty: true, shouldValidate: true });
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
                      if (field.options.some((option) => option.value === values[index])) {
                        form.setValue(`values.${index}`, "", { shouldDirty: true, shouldValidate: true });
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
                    {...form.register(`values.${index}`)}
                    maxLength={300}
                    className="h-9 min-w-[220px] flex-1 rounded-[6px] border border-[var(--border)] bg-[var(--surface-bg)] px-3 text-xs outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-border)] disabled:cursor-not-allowed disabled:opacity-60"
                  />
                ) : null}
              </div>
            )}
            {form.formState.errors.values?.[index]?.message ? (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {form.formState.errors.values[index]?.message}
              </p>
            ) : null}
          </fieldset>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          disabled={!enabled || submitting || cancelling}
          onClick={onCancel}
          className="h-9 rounded-[6px] bg-[var(--surface-soft)] px-4 text-xs font-medium text-[var(--primary)] transition hover:bg-[var(--active-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-bg)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {cancelling ? "取消中" : "取消"}
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
            disabled={!enabled || submitting || cancelling || missingRequired}
            type="submit"
            className="inline-flex h-9 items-center rounded-[6px] bg-[var(--accent)] px-5 text-xs font-semibold text-[var(--surface-bg)] transition hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-bg)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "提交中" : "确认"}
          </button>
        </div>
      </div>
      {!enabled ? (
        <p className="mt-2 text-right text-xs text-[var(--text-secondary)]">当前创作已不再等待此表单。</p>
      ) : null}
    </form>
  );
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
