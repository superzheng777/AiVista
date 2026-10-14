"use client";

import { cn } from "@/shared/lib/cn";
import { AccentSquare } from "@/shared/ui/editorial-ornaments/editorial-ornaments";
import Link from "next/link";

export function FeedTab({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative mr-10 flex h-full items-center text-[17px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
        active ? "font-semibold text-[var(--primary)]" : "text-[var(--text-secondary)] hover:text-[var(--primary)]",
      )}
    >
      {children}
      {active ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--primary)]" aria-hidden /> : null}
    </Link>
  );
}

export function FeedSkeleton() {
  return (
    <div className="columns-2 gap-[18px] sm:columns-3 lg:columns-4 min-[1600px]:columns-5">
      {Array.from({ length: 10 }, (_, index) => (
        <div
          key={index}
          className="mb-[18px] break-inside-avoid animate-pulse overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface-bg)]"
        >
          <div className={cn("bg-[var(--skeleton)]", index % 3 === 0 ? "h-72" : index % 3 === 1 ? "h-48" : "h-60")} />
          <div className="h-[52px] border-t border-[var(--border)]" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  message,
  action,
  href,
  onAction,
}: {
  message: string;
  action?: string;
  href?: string;
  onAction?: () => void;
}) {
  return (
    <section className="mx-auto mt-24 max-w-[420px] text-center">
      <div aria-hidden="true" className="relative mx-auto h-14 w-16">
        <span className="absolute left-2 top-0 size-9 border border-[var(--text-secondary)]" />
        <span className="absolute bottom-0 right-1 size-9 border border-[var(--primary)]" />
        <AccentSquare size={8} className="absolute bottom-1 left-0" />
        <span className="absolute right-0 top-0 text-lg leading-none">✦</span>
      </div>
      <p className="mt-5 text-sm text-[var(--text-secondary)]">{message}</p>
      {action && href ? (
        <Link href={href} className="mt-4 inline-flex text-sm font-medium text-[var(--accent)] hover:underline">
          {action}
        </Link>
      ) : null}
      {action && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 text-sm font-medium text-[var(--accent)] hover:underline"
        >
          {action}
        </button>
      ) : null}
    </section>
  );
}
