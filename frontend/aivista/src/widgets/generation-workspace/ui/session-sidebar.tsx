"use client";

import type { SessionSummary } from "@/entities/creation-session/model/session";
import type { SessionIndicator } from "@/entities/user-event-stream/model/user-event-stream-types";
import { PencilLine, Sparkles } from "lucide-react";
import styles from "./generation-workspace.module.css";
import { SessionHistoryItem } from "./session-history-item";

function SessionSkeleton() {
  return <div className="h-11 animate-pulse rounded-[7px] bg-[var(--skeleton-light)]" />;
}

export function SessionSidebar({
  sessions,
  sessionId,
  sessionIndicators,
  isPending,
  isError,
  onRetry,
  onNewConversation,
  selectSession,
  handleSessionDeleted,
}: {
  sessions: SessionSummary[] | undefined;
  sessionId: string | null;
  sessionIndicators: Record<string, SessionIndicator>;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  onNewConversation: () => void;
  selectSession: (sessionId: string) => void;
  handleSessionDeleted: (sessionId: string) => Promise<void>;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-6 py-[30px]">
      <p className="pl-1 text-[11px] font-semibold leading-none tracking-[0.16em] text-[var(--text-secondary)]">
        <span className="text-[var(--accent)]">02</span> / CREATE
      </p>
      <div className="mt-[14px] flex items-center justify-between">
        <h1 className="text-2xl font-bold leading-tight">开启创作</h1>
        <Sparkles className="size-5 text-[var(--text-secondary)]" />
      </div>
      <button
        type="button"
        onClick={onNewConversation}
        className={`${styles.control} mt-6 inline-flex h-11 w-full shrink-0 items-center gap-[10px] rounded-[7px] border border-transparent bg-[var(--accent)] px-[13px] text-left text-sm font-semibold text-[var(--surface-bg)] hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2`}
      >
        <PencilLine className="size-[18px] shrink-0" />
        新对话
      </button>
      <div className="mt-2">
        <nav aria-label="历史会话" className="space-y-1">
          {isPending ? <SessionSkeleton /> : null}
          {isError ? (
            <button onClick={onRetry} className="px-2 py-3 text-sm text-[var(--accent-hover)]">
              会话加载失败，点击重试
            </button>
          ) : null}
          {sessions?.map((session) => (
            <SessionHistoryItem
              key={session.sessionId}
              session={session}
              selected={sessionId === session.sessionId}
              indicator={sessionIndicators?.[session.sessionId]}
              onSelect={() => selectSession(session.sessionId)}
              onDeleted={handleSessionDeleted}
            />
          ))}
          {!isPending && !sessions?.length ? (
            <p className="px-2 py-2 text-xs leading-5 text-[var(--text-secondary)]">尚无历史会话。</p>
          ) : null}
        </nav>
      </div>
    </div>
  );
}
