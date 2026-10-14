"use client";

import { discardOptimisticResourceUpdates } from "@/entities/image-resource/model/optimistic-resource-update";
import { configureBrowserAuth } from "@/shared/api/browser-client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useAuthDialogStore } from "./auth-dialog-store";
import { useAuthStore } from "./auth-store";

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
