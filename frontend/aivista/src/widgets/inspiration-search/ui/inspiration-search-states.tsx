"use client";

import { getApiErrorCode, getRetryAfterSeconds } from "@/shared/api/api-response";
import { useEffect, useState } from "react";

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const code = getApiErrorCode(error);
  const message =
    code === 42904
      ? "搜索请求过于频繁，请稍后再试。"
      : code === 50301
        ? "搜索服务暂不可用，发现和关注列表仍可正常使用。"
        : "搜索结果加载失败。";
  return (
    <section role="alert" className="rounded-2xl border border-destructive/20 bg-card p-8 text-center">
      <p className="text-sm text-destructive">{message}</p>
      <RetryButton error={error} onRetry={onRetry} label="重新加载" />
    </section>
  );
}

export function LoadMoreError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const code = getApiErrorCode(error);
  const message = code === 42904 ? "加载过于频繁。" : code === 50301 ? "搜索服务暂不可用。" : "继续加载失败。";
  return (
    <div role="alert" className="pt-4 text-center">
      <p className="text-sm text-destructive">{message}</p>
      <RetryButton error={error} onRetry={onRetry} label="重试加载" />
    </div>
  );
}

function RetryButton({ error, onRetry, label }: { error: unknown; onRetry: () => void; label: string }) {
  const [retryAfter, setRetryAfter] = useState(() =>
    getApiErrorCode(error) === 42904 ? getRetryAfterSeconds(error) : 0,
  );
  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = window.setTimeout(() => setRetryAfter((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [retryAfter]);
  return (
    <button
      type="button"
      disabled={retryAfter > 0}
      onClick={onRetry}
      className="mt-3 text-sm font-medium underline disabled:cursor-not-allowed disabled:opacity-50"
    >
      {retryAfter > 0 ? `${retryAfter} 秒后可重试` : label}
    </button>
  );
}

export function State({ message }: { message: string }) {
  return (
    <section className="rounded-2xl border border-dashed border-border p-10 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </section>
  );
}

export function Skeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="aspect-square animate-pulse rounded-2xl bg-muted" />
      ))}
    </div>
  );
}
