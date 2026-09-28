"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import { searchFormSchema, type SearchFormValues } from "@/features/inspiration/model/search-query";
import { cn } from "@/shared/lib/cn";

export function InspirationSearchForm({
  initialValue = "",
  compact = false,
}: {
  initialValue?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const form = useForm<SearchFormValues>({
    resolver: zodResolver(searchFormSchema),
    defaultValues: { keyword: initialValue },
    mode: "onChange",
  });
  const error = form.formState.errors.keyword?.message;

  function submit(values: SearchFormValues) {
    router.push(`/inspirations/search?q=${encodeURIComponent(values.keyword)}`);
  }

  return (
    <form
      onSubmit={form.handleSubmit(submit)}
      role="search"
      className={cn("relative", compact ? "mb-[10px] ml-auto w-44 sm:w-[300px]" : "w-full max-w-xl")}
    >
      <label className="sr-only" htmlFor={compact ? "inspiration-search-compact" : "inspiration-search"}>
        搜索公开作品
      </label>
      <input
        id={compact ? "inspiration-search-compact" : "inspiration-search"}
        {...form.register("keyword")}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${compact ? "compact-" : ""}search-error` : undefined}
        placeholder="搜索标题或提示词"
        className="h-[42px] w-full rounded-[7px] border border-[var(--border)] bg-[var(--surface-bg)] pl-4 pr-[42px] text-sm text-[var(--primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
      />
      <button
        type="submit"
        aria-label="搜索"
        className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-[6px] text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] hover:text-[var(--primary)]"
      >
        <Search className="size-[18px]" />
      </button>
      {error ? (
        <p
          id={`${compact ? "compact-" : ""}search-error`}
          role="alert"
          className="absolute right-0 top-full mt-1 text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
