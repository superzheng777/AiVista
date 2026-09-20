"use client";

import { ClipboardList } from "lucide-react";
import { useState } from "react";

import type { AgentFormAnswer, CreationForm } from "@/entities/generation/model/generation";
import { cn } from "@/lib/utils";

export function AgentInputFormCard({ value, enabled, submitting, onResolve }: {
  value: CreationForm;
  enabled: boolean;
  submitting: boolean;
  onResolve: (action: "SUBMIT" | "SKIP", answers: Record<string, AgentFormAnswer> | null) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, AgentFormAnswer>>(() => initialFormAnswers(value));
  const missingRequired = value.form.fields.some((field) => {
    if (!field.required) return false;
    const answer = answers[field.id];
    return !answer || !answer.value.trim();
  });
  if (value.status !== "PENDING") {
    return (
      <section className="mt-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3" aria-label="已处理的需求确认表单">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ClipboardList className="size-4 text-[var(--accent)]" />
          {value.form.title}
        </div>
        {value.status === "SKIPPED" ? (
          <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">已跳过，Agent 将根据已有信息采用合理默认值。</p>
        ) : (
          <dl className="mt-2 space-y-1 text-xs leading-5 text-[var(--text-secondary)]">
            {value.form.fields.map((field) => {
              const answer = value.answers?.[field.id];
              if (!answer) return null;
              return <div key={field.id} className="flex gap-1"><dt className="shrink-0">{field.label}：</dt>
                <dd className="text-[var(--primary)]">{formAnswerLabel(field, answer)}</dd></div>;
            })}
          </dl>
        )}
      </section>
    );
  }
  return (
    <section className="mt-3 rounded-[8px] border border-[var(--border-strong)] bg-[var(--surface-bg)] p-4" aria-label="需求确认表单">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <ClipboardList className="size-4 text-[var(--accent)]" />
        {value.form.title}
      </div>
      <div className="mt-4 space-y-5">
        {value.form.fields.map((field) => (
          <fieldset key={field.id} disabled={!enabled || submitting}>
            <legend className="mb-2 text-xs font-medium text-[var(--text-secondary)]">
              {field.label}{field.required ? <span className="ml-1 text-[var(--accent)]">*</span> : null}
            </legend>
            {field.type === "TEXT" ? (
              <input
                value={answers[field.id]?.value ?? ""}
                maxLength={300}
                placeholder={field.placeholder}
                onChange={(event) => setAnswers((current) => ({ ...current,
                  [field.id]: { kind: "TEXT", value: event.target.value } }))}
                className="h-11 w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface-bg)] px-3 text-sm outline-none transition focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-60"
              />
            ) : (
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={field.label}>
                {field.options.map((option) => {
                  const selected = answers[field.id]?.kind === "OPTION" && answers[field.id]?.value === option.value;
                  return <button key={option.value} type="button" role="radio" aria-checked={selected}
                    onClick={() => setAnswers((current) => ({ ...current,
                      [field.id]: { kind: "OPTION", value: option.value } }))}
                    className={cn("min-h-9 rounded-[6px] border px-3 text-xs transition",
                      selected ? "border-[var(--accent-border)] bg-[var(--active-bg)] text-[var(--primary)]"
                        : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-soft)]")}>{option.label}</button>;
                })}
                {field.allowCustom ? (
                  <button type="button" role="radio" aria-checked={answers[field.id]?.kind === "CUSTOM"}
                    onClick={() => setAnswers((current) => ({ ...current, [field.id]: { kind: "CUSTOM",
                      value: current[field.id]?.kind === "CUSTOM" ? current[field.id]!.value
                        : field.customInitialValue ?? "" } }))}
                    className={cn("min-h-9 rounded-[6px] border px-3 text-xs transition",
                      answers[field.id]?.kind === "CUSTOM"
                        ? "border-[var(--accent-border)] bg-[var(--active-bg)] text-[var(--primary)]"
                        : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-soft)]")}>{field.customLabel ?? "自定义"}</button>
                ) : null}
                {answers[field.id]?.kind === "CUSTOM" ? (
                  <input aria-label={`${field.label}自定义内容`} value={answers[field.id]?.value ?? ""}
                    maxLength={300}
                    onChange={(event) => setAnswers((current) => ({ ...current,
                      [field.id]: { kind: "CUSTOM", value: event.target.value } }))}
                    className="h-9 min-w-[220px] flex-1 rounded-[6px] border border-[var(--border)] bg-[var(--surface-bg)] px-3 text-xs outline-none focus:border-[var(--accent-border)] focus:ring-2 focus:ring-[var(--accent-soft)]" />
                ) : null}
              </div>
            )}
          </fieldset>
        ))}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" disabled={!enabled || submitting} onClick={() => onResolve("SKIP", null)}
          className="h-9 rounded-[6px] bg-[var(--surface-soft)] px-4 text-xs font-medium text-[var(--primary)] hover:bg-[var(--active-bg)] disabled:opacity-50">跳过</button>
        <button type="button" disabled={!enabled || submitting || missingRequired}
          onClick={() => onResolve("SUBMIT", answers)}
          className="inline-flex h-9 items-center rounded-[6px] bg-[var(--primary)] px-5 text-xs font-semibold text-[var(--surface-bg)] hover:bg-[var(--primary-hover)] disabled:opacity-50">
          {submitting ? "提交中" : "确认"}
        </button>
      </div>
      {!enabled ? <p className="mt-2 text-right text-xs text-[var(--text-secondary)]">当前创作已不再等待此表单。</p> : null}
    </section>
  );
}

function initialFormAnswers(value: CreationForm): Record<string, AgentFormAnswer> {
  const answers: Record<string, AgentFormAnswer> = {};
  for (const field of value.form.fields) {
    if (field.type === "TEXT" && field.initialValue !== undefined) {
      answers[field.id] = { kind: "TEXT", value: field.initialValue };
    } else if (field.type === "SINGLE_SELECT" && field.initialValue !== undefined) {
      answers[field.id] = { kind: "OPTION", value: field.initialValue };
    } else if (field.type === "SINGLE_SELECT" && field.allowCustom
        && field.customInitialValue !== undefined) {
      answers[field.id] = { kind: "CUSTOM", value: field.customInitialValue };
    }
  }
  return answers;
}

function formAnswerLabel(field: CreationForm["form"]["fields"][number], answer: AgentFormAnswer): string {
  if (field.type === "SINGLE_SELECT" && answer.kind === "OPTION") {
    return field.options.find((option) => option.value === answer.value)?.label ?? answer.value;
  }
  return answer.value;
}
