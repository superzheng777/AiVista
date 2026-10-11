"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { discardOptimisticResourceUpdates } from "@/entities/generation/model/optimistic-resource-update";
import { useAuthStore } from "./auth-store";
import { useAuthDialogStore } from "./auth-dialog-store";
import { configureBrowserAuth } from "@/shared/api/browser-client";

export function AuthInitializer() {
  const queryClient = useQueryClient();
  const status = useAuthStore((state) => state.status);
  const userId = useAuthStore((state) => state.user?.id);
  const restoreSession = useAuthStore((state) => state.restoreSession);
  const cachedIdentity = useRef<string | null | undefined>(undefined);

  useEffect(
    () =>
      configureBrowserAuth({
        getAccessToken: () => useAuthStore.getState().accessToken,
        refreshAccessToken: () => useAuthStore.getState().refreshAccessToken(),
        onSessionInvalid: () => {
          useAuthStore.getState().clearSession();
        },
      }),
    [],
  );

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (status === "loading" || status === "error") return;
    const identity = status === "authenticated" ? (userId ?? null) : null;
    if (cachedIdentity.current === identity) return;
    cachedIdentity.current = identity;
    discardOptimisticResourceUpdates(queryClient);
    if (status === "anonymous") {
      queryClient.clear();
    } else {
      // Public caches also contain viewer-specific likes and following state.
      void queryClient.resetQueries();
    }
  }, [queryClient, status, userId]);

  useEffect(() => () => useAuthDialogStore.getState().close(), []);

  return null;
}
