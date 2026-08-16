"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { validateSearchInput } from "@/features/inspiration/model/search-query";
import { cn } from "@/lib/utils";

export function InspirationSearchForm({ initialValue = "", compact = false }: { initialValue?: string; compact?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const validation = validateSearchInput(value);
    setError(validation);
    if (validation) return;
    router.push(`/inspirations/search?q=${encodeURIComponent(value)}`);
  }

  return (
    <form onSubmit={submit} role="search" className={cn("relative", compact ? "ml-auto w-36 sm:w-64" : "w-full max-w-xl")}>
      <label className="sr-only" htmlFor={compact ? "inspiration-search-compact" : "inspiration-search"}>搜索公开作品</label>
      <input
        id={compact ? "inspiration-search-compact" : "inspiration-search"}
        value={value}
        onChange={(event) => { setValue(event.target.value); if (error) setError(null); }}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${compact ? "compact-" : ""}search-error` : undefined}
        placeholder="搜索标题或提示词"
        className="h-10 w-full rounded-xl border border-border bg-background pl-3 pr-10 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-900"
      />
      <button type="submit" aria-label="搜索" className="absolute right-1 top-1 grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
        <Search className="size-4" />
      </button>
      {error ? <p id={`${compact ? "compact-" : ""}search-error`} role="alert" className="absolute right-0 top-full mt-1 text-xs text-destructive">{error}</p> : null}
    </form>
  );
}
