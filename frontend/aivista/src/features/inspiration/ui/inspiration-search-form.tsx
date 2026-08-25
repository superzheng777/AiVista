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
    <form onSubmit={submit} role="search" className={cn("relative", compact ? "mb-[10px] ml-auto w-44 sm:w-[300px]" : "w-full max-w-xl")}>
      <label className="sr-only" htmlFor={compact ? "inspiration-search-compact" : "inspiration-search"}>搜索公开作品</label>
      <input
        id={compact ? "inspiration-search-compact" : "inspiration-search"}
        value={value}
        onChange={(event) => { setValue(event.target.value); if (error) setError(null); }}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${compact ? "compact-" : ""}search-error` : undefined}
        placeholder="搜索标题或提示词"
        className="h-[42px] w-full rounded-[7px] border border-[#d9cfbf] bg-[#fffdf7] pl-4 pr-[42px] text-sm text-[#171612] outline-none transition placeholder:text-[#9b9387] focus:border-[#c95f3f] focus:ring-2 focus:ring-[#c95f3f]/20"
      />
      <button type="submit" aria-label="搜索" className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-[6px] text-[#716b61] hover:bg-[#faf5eb] hover:text-[#171612]">
        <Search className="size-[18px]" />
      </button>
      {error ? <p id={`${compact ? "compact-" : ""}search-error`} role="alert" className="absolute right-0 top-full mt-1 text-xs text-destructive">{error}</p> : null}
    </form>
  );
}
