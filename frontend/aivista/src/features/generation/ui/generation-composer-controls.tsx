"use client";

import { ArrowUp, Check, ChevronDown, LoaderCircle, type LucideIcon } from "lucide-react";
import { type ComponentPropsWithRef } from "react";

export type GenerationSelectOption = {
  value: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
};

type GenerationSelectProps = {
  ariaLabel: string;
  value: string;
  options: readonly [GenerationSelectOption, ...GenerationSelectOption[]];
  isOpen: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onSelect: (value: string) => void;
};

export type GenerationChoiceOption = {
  value: string;
  label: string;
  icon?: LucideIcon;
};

type GenerationChoiceGroupProps = {
  ariaLabel: string;
  value: string;
  options: readonly GenerationChoiceOption[];
  disabled?: boolean;
  onSelect: (value: string) => void;
};

type GenerationToolbarControlProps = ComponentPropsWithRef<"button"> & {
  isActive?: boolean;
};

type GenerationSubmitButtonProps = {
  compact: boolean;
  disabled: boolean;
  isLoading: boolean;
  label: string;
};

export function GenerationToolbarControl({
  children,
  className = "",
  isActive = false,
  ...buttonProps
}: GenerationToolbarControlProps) {
  return (
    <button
      {...buttonProps}
      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-[5px] border-0 px-2 text-xs leading-5 text-[var(--primary)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60 ${isActive ? "bg-[var(--active-bg)]" : "bg-[var(--surface-bg)] hover:bg-[var(--active-bg)]"} ${className}`}
    >
      {children}
    </button>
  );
}

export function GenerationSubmitButton({ compact, disabled, isLoading, label }: GenerationSubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={disabled}
      aria-label={label}
      className={`z-10 inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white transition hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${compact ? "absolute right-[5px] top-1/2 size-12 -translate-y-1/2" : "mr-1 size-10"}`}
    >
      {isLoading ? (
        <LoaderCircle className={`${compact ? "size-5" : "size-4"} animate-spin`} />
      ) : (
        <ArrowUp className={compact ? "size-5" : "size-4"} strokeWidth={2.5} />
      )}
    </button>
  );
}

export function GenerationSelect({
  ariaLabel,
  value,
  options,
  isOpen,
  disabled = false,
  onToggle,
  onSelect,
}: GenerationSelectProps) {
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const SelectedIcon = selectedOption.icon;

  return (
    <span className="relative block">
      <GenerationToolbarControl
        type="button"
        disabled={disabled}
        isActive={isOpen}
        onClick={onToggle}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className="w-full justify-start text-left font-normal"
      >
        <SelectedIcon aria-hidden="true" className="size-3.5 shrink-0 text-[var(--accent-hover)]" />
        <span className="whitespace-nowrap leading-5">{selectedOption.label}</span>
        <ChevronDown
          aria-hidden="true"
          className={`size-3.5 shrink-0 text-[var(--text-secondary)] transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </GenerationToolbarControl>
      {isOpen ? (
        <span
          role="listbox"
          aria-label={ariaLabel}
          className="absolute bottom-[calc(100%+4px)] left-0 z-30 grid w-full min-w-[180px] gap-0.5 rounded-[7px] border border-[var(--border)] bg-[var(--surface-bg)] p-1 shadow-[0_8px_18px_rgb(43_35_25_/_14%)]"
        >
          {options.map((option) => {
            const OptionIcon = option.icon;
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                onClick={() => onSelect(option.value)}
                className={`flex min-h-8 items-center gap-2 rounded-[4px] px-2 text-left text-xs transition ${option.disabled ? "cursor-not-allowed text-[var(--text-muted)] opacity-60" : isSelected ? "bg-[var(--active-bg)] text-[var(--primary)]" : "text-[var(--primary)] hover:bg-[var(--surface-hover)]"}`}
              >
                <OptionIcon aria-hidden="true" className="size-3.5 shrink-0 text-[var(--accent-hover)]" />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {isSelected ? <Check aria-hidden="true" className="size-3.5 shrink-0 text-[var(--accent)]" /> : null}
              </button>
            );
          })}
        </span>
      ) : null}
    </span>
  );
}

export function GenerationChoiceGroup({
  ariaLabel,
  value,
  options,
  disabled = false,
  onSelect,
}: GenerationChoiceGroupProps) {
  const hasIcons = options.some((option) => option.icon);
  const columns =
    options.length === 7
      ? "grid-cols-4 sm:grid-cols-7"
      : options.length === 6 && hasIcons
        ? "grid-cols-6"
        : hasIcons
          ? "grid-cols-5"
          : "grid-cols-3 sm:grid-cols-6";

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`grid overflow-hidden rounded-[7px] border border-[var(--border)] bg-[var(--surface-bg)] ${columns}`}
    >
      {options.map((option) => {
        const OptionIcon = option.icon;
        const isSelected = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onSelect(option.value)}
            className={`flex h-9 min-w-0 cursor-pointer appearance-none items-center justify-center border border-transparent text-sm shadow-none outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60 ${OptionIcon ? "gap-1.5 px-1" : "px-1"} ${isSelected ? "relative z-10 rounded-[5px] border-[var(--accent-border)] bg-[var(--active-bg)] text-[var(--primary)]" : "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-soft)]"}`}
          >
            {OptionIcon ? (
              <OptionIcon
                aria-hidden="true"
                className={`size-3.5 shrink-0 ${isSelected ? "text-[var(--accent-hover)]" : "text-[var(--text-secondary)]"}`}
              />
            ) : null}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
