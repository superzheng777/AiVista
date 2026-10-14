"use client";

import { type SessionSummary } from "@/entities/creation-session/model/session";
import {
  selectSessionIndicators,
  useUserEventStreamStore,
} from "@/entities/user-event-stream/model/user-event-stream-store";
import { generationQueryKeys, listGenerationSessions } from "@/features/generation/api/generation-api";
import { forgetSessionEvents, isSessionDeleted } from "@/features/generation/model/session-events";
import { Dialog } from "@base-ui/react/dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useId, useRef, useState, useSyncExternalStore } from "react";
import { useShallow } from "zustand/react/shallow";
import { ConversationPanel } from "./conversation-panel";
import { GenerationWorkspaceToolbar } from "./generation-workspace-toolbar";
import styles from "./generation-workspace.module.css";
import { NewConversationPanel } from "./new-conversation-panel";
import { SessionSidebar } from "./session-sidebar";

const desktopQuery = "(min-width: 1024px)";

const desktopSnapshot = () => window.matchMedia(desktopQuery).matches;

const serverDesktopSnapshot = () => true;

export function GenerationWorkspace() {
  const client = useQueryClient();
  const router = useRouter();
  const sessionId = useSearchParams().get("sessionId");
  const sessionIndicators = useUserEventStreamStore(useShallow(selectSessionIndicators));
  const acknowledgeSession = useUserEventStreamStore((state) => state.acknowledgeSession);
  const sessionsQuery = useQuery({ queryKey: generationQueryKeys.sessions(), queryFn: listGenerationSessions });
  const sessions = sessionsQuery.data;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebarId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const subscribeDesktop = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(desktopQuery);
      const update = () => {
        setDrawerOpen(false);
        onChange();
      };
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    },
    [setDrawerOpen],
  );
  const desktop = useSyncExternalStore(subscribeDesktop, desktopSnapshot, serverDesktopSnapshot);
  const sidebarExpanded = desktop ? !sidebarCollapsed : drawerOpen;
  function selectSession(nextSessionId: string) {
    setDrawerOpen(false);
    router.push(`/generate?sessionId=${encodeURIComponent(nextSessionId)}`);
  }
  async function handleSessionDeleted(deletedSessionId: string) {
    forgetSessionEvents(client, deletedSessionId);
    await Promise.all([
      client.cancelQueries({ queryKey: generationQueryKeys.sessions(), exact: true }),
      client.cancelQueries({ queryKey: generationQueryKeys.session(deletedSessionId), exact: true }),
    ]);
    client.setQueryData<SessionSummary[]>(generationQueryKeys.sessions(), (current) =>
      current?.filter((session) => session.sessionId !== deletedSessionId),
    );
    client.removeQueries({ queryKey: generationQueryKeys.session(deletedSessionId), exact: true });
    acknowledgeSession(deletedSessionId);
    if (sessionId === deletedSessionId) window.history.replaceState(null, "", "/generate");
  }

  const sidebar = (
    <SessionSidebar
      sessions={sessions}
      sessionId={sessionId}
      sessionIndicators={sessionIndicators}
      isPending={sessionsQuery.isPending}
      isError={sessionsQuery.isError}
      onRetry={() => void sessionsQuery.refetch()}
      onNewConversation={() => {
        setDrawerOpen(false);
        // This only changes client-side session selection. Next syncs search
        // params with the History API without reusing a cached route URL.
        window.history.pushState(null, "", "/generate");
      }}
      selectSession={selectSession}
      handleSessionDeleted={handleSessionDeleted}
    />
  );
  const toolbar = (
    <GenerationWorkspaceToolbar
      toggleRef={toggleRef}
      sidebarExpanded={sidebarExpanded}
      sidebarId={sidebarId}
      desktop={desktop}
      onToggle={() => {
        if (desktop) {
          toggleRef.current?.focus();
          setSidebarCollapsed((value) => !value);
        } else setDrawerOpen(true);
      }}
    />
  );
  return (
    <section
      className={`min-h-dvh overflow-x-hidden bg-[var(--page-bg)] text-[var(--primary)] ${sidebarCollapsed ? "[--session-sidebar-width:0px]" : "[--session-sidebar-width:320px]"}`}
    >
      <div className={`${styles.layout} grid min-h-dvh grid-cols-[minmax(0,1fr)] lg:h-dvh`}>
        {desktop ? (
          <aside
            id={sidebarId}
            aria-label="会话侧栏"
            aria-hidden={sidebarCollapsed}
            inert={sidebarCollapsed}
            className="hidden h-dvh min-h-0 min-w-0 overflow-hidden bg-[var(--surface-bg)] lg:block"
          >
            <div className={styles.sidebarContent}>{sidebar}</div>
          </aside>
        ) : null}
        <div key="workspace" className="min-w-0">
          {sessionId && !isSessionDeleted(client, sessionId) ? (
            <ConversationPanel key={sessionId} sessionId={sessionId} toolbar={toolbar} />
          ) : (
            <NewConversationPanel toolbar={toolbar} />
          )}
        </div>
      </div>
      <Dialog.Root open={!desktop && drawerOpen} onOpenChange={setDrawerOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={`${styles.backdrop} fixed inset-0 z-50 bg-[var(--overlay)]`} />
          <Dialog.Popup
            id={`${sidebarId}-drawer`}
            finalFocus={toggleRef}
            className={`${styles.drawer} fixed inset-y-0 left-0 z-[60] flex w-[min(320px,calc(100vw-3rem))] flex-col bg-[var(--surface-bg)] pb-[env(safe-area-inset-bottom)] shadow-xl outline-none`}
          >
            <Dialog.Title className="sr-only">会话侧栏</Dialog.Title>
            <Dialog.Close
              aria-label="收起会话侧栏"
              className={`${styles.control} absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-[6px] text-[var(--text-secondary)] hover:bg-[var(--active-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]`}
            >
              <X aria-hidden="true" className="size-4" />
            </Dialog.Close>
            {sidebar}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
