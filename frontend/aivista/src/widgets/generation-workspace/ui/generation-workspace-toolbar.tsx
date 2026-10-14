"use client";
import { FolderClock, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import type { RefObject } from "react";
import styles from "./generation-workspace.module.css";
export function GenerationWorkspaceToolbar({
  toggleRef,
  sidebarExpanded,
  sidebarId,
  desktop,
  onToggle,
}: {
  toggleRef: RefObject<HTMLButtonElement | null>;
  sidebarExpanded: boolean;
  sidebarId: string;
  desktop: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`${styles.toolbar} pointer-events-none fixed left-5 right-5 top-[19px] z-20 flex items-center justify-between sm:left-8 sm:right-8 md:left-[calc(88px+2rem)] lg:left-[calc(88px+var(--session-sidebar-width)+2rem)]`}
    >
      <button
        ref={toggleRef}
        type="button"
        aria-label={sidebarExpanded ? "收起会话侧栏" : "展开会话侧栏"}
        title={sidebarExpanded ? "收起会话侧栏" : "展开会话侧栏"}
        aria-expanded={sidebarExpanded}
        aria-controls={desktop ? sidebarId : `${sidebarId}-drawer`}
        onClick={onToggle}
        className={`${styles.control} pointer-events-auto grid size-9 place-items-center rounded-[6px] border border-[var(--border)] bg-[var(--surface-bg)] text-[var(--text-secondary)] hover:bg-[var(--active-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]`}
      >
        {sidebarExpanded ? (
          <PanelLeftClose aria-hidden="true" className="size-4" />
        ) : (
          <PanelLeftOpen aria-hidden="true" className="size-4" />
        )}
      </button>
      <Link
        href="/assets"
        className={`${styles.control} pointer-events-auto inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface-bg)] px-3 text-sm font-medium hover:bg-[var(--active-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]`}
      >
        <FolderClock aria-hidden="true" className="size-4" />
        资产库
      </Link>
    </div>
  );
}
