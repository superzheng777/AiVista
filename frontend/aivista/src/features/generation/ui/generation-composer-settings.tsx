"use client";

import { CircleHelp, Lightbulb, RectangleHorizontal, RectangleVertical, Square, type LucideIcon } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { aspectRatioOptions, type GenerationFormValues } from "../model/generation-form";
import type { GenerationChoiceOption } from "./generation-composer-controls";
import { GenerationChoiceGroup } from "./generation-composer-controls";

const aspectRatioIcons: Record<GenerationFormValues["aspectRatio"], LucideIcon> = {
  "1:1": Square,
  "4:3": RectangleHorizontal,
  "3:4": RectangleVertical,
  "16:9": RectangleHorizontal,
  "9:16": RectangleVertical,
};

const aspectRatioChoiceOptions: readonly GenerationChoiceOption[] = aspectRatioOptions.map((option) => ({
  value: option.value,
  label: option.value,
  icon: aspectRatioIcons[option.value],
}));

const imageCountOptions: readonly GenerationChoiceOption[] = [1, 2, 3, 4, 5, 6].map((count) => ({
  value: String(count),
  label: String(count),
}));

const agentAspectRatioOptions: readonly GenerationChoiceOption[] = [
  { value: "AUTO", label: "自动" },
  ...aspectRatioChoiceOptions,
];

const agentImageCountOptions: readonly GenerationChoiceOption[] = [{ value: "0", label: "自动" }, ...imageCountOptions];

export function GenerationComposerSettings({
  form,
  mode,
  agentAspectRatio,
  aspectRatio,
  agentImageCount,
  imageCount,
  negativePrompt,
  isSubmitDisabled,
}: {
  form: UseFormReturn<GenerationFormValues>;
  mode: GenerationFormValues["mode"];
  agentAspectRatio: GenerationFormValues["agentAspectRatio"];
  aspectRatio: GenerationFormValues["aspectRatio"];
  agentImageCount: number;
  imageCount: number;
  negativePrompt: GenerationFormValues["negativePrompt"];
  isSubmitDisabled: boolean;
}) {
  return (
    <div
      id="generation-options"
      role="dialog"
      aria-label="生成配置"
      className="absolute bottom-[calc(100%+10px)] left-0 z-50 w-[min(32rem,calc(100vw-2rem))] rounded-[10px] border border-[var(--border)] bg-[var(--surface-bg)] p-3 shadow-[0_8px_18px_rgb(43_35_25_/_12%)] sm:p-4"
    >
      <div className="grid gap-4">
        <section aria-labelledby="aspect-ratio-label" className="grid gap-2">
          <div className="inline-flex items-center gap-1.5">
            <h3 id="aspect-ratio-label" className="text-sm font-semibold text-[var(--primary)]">
              画幅比例
            </h3>
            <CircleHelp aria-hidden="true" className="size-3.5 text-[var(--text-muted)]" />
          </div>
          <GenerationChoiceGroup
            ariaLabel="画幅比例"
            value={mode === "agent" ? agentAspectRatio : aspectRatio}
            options={mode === "agent" ? agentAspectRatioOptions : aspectRatioChoiceOptions}
            disabled={isSubmitDisabled}
            onSelect={(value) =>
              mode === "agent"
                ? form.setValue("agentAspectRatio", value as GenerationFormValues["agentAspectRatio"], {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                : form.setValue("aspectRatio", value as GenerationFormValues["aspectRatio"], {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
            }
          />
        </section>

        <section aria-labelledby="image-count-label" className="grid gap-2">
          <div className="inline-flex items-center gap-1.5">
            <h3 id="image-count-label" className="text-sm font-semibold text-[var(--primary)]">
              生成数量
            </h3>
            <CircleHelp aria-hidden="true" className="size-3.5 text-[var(--text-muted)]" />
          </div>
          <GenerationChoiceGroup
            ariaLabel="生成数量"
            value={String(mode === "agent" ? agentImageCount : imageCount)}
            options={mode === "agent" ? agentImageCountOptions : imageCountOptions}
            disabled={isSubmitDisabled}
            onSelect={(value) =>
              mode === "agent"
                ? form.setValue("agentImageCount", Number(value), {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                : form.setValue("imageCount", Number(value), { shouldDirty: true, shouldValidate: true })
            }
          />
        </section>
      </div>

      {mode === "image" ? (
        <>
          <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 border-y border-dashed border-[var(--border)] py-3 text-[var(--primary)]">
            <span className="grid gap-1">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                提示词优化 <CircleHelp aria-hidden="true" className="size-3.5 text-[var(--text-muted)]" />
              </span>
              <span className="text-xs font-normal text-[var(--text-secondary)]">优化提示词表达，提升画面质量</span>
            </span>
            <input
              type="checkbox"
              {...form.register("promptExtend")}
              disabled={isSubmitDisabled}
              className="size-4 shrink-0 accent-[var(--accent)] disabled:cursor-not-allowed"
            />
          </label>

          <label className="mt-3 grid gap-2 text-sm font-semibold text-[var(--primary)]">
            <span className="inline-flex items-center gap-1.5">
              负面提示词 <span className="font-normal text-[var(--text-secondary)]">（可选）</span>{" "}
              <CircleHelp aria-hidden="true" className="size-3.5 text-[var(--text-muted)]" />
            </span>
            <span className="relative">
              <textarea
                {...form.register("negativePrompt")}
                disabled={isSubmitDisabled}
                rows={1}
                maxLength={200}
                className="min-h-12 w-full resize-y rounded-[6px] border border-[var(--border-strong)] bg-[var(--surface-bg)] px-3 pb-6 pt-2 text-sm font-normal leading-5 outline-none placeholder:text-[var(--placeholder)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="例如：模糊、低清晰度"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-2 right-3 text-xs font-normal text-[var(--text-secondary)]"
              >
                {negativePrompt?.length ?? 0} / 200
              </span>
            </span>
          </label>
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <Lightbulb aria-hidden="true" className="size-3.5 text-[var(--accent-hover)]" />
            填写负面提示词，有助于减少不想要的内容
          </p>
          {form.formState.errors.negativePrompt ? (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {form.formState.errors.negativePrompt.message}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
