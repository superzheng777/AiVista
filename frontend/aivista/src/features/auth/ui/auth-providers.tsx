"use client";

import type { ReactNode } from "react";

import { AuthDialogProvider } from "@/features/auth/model/auth-dialog-provider";
import { SessionProvider } from "@/features/auth/model/session-provider";
import { AuthDialog } from "@/features/auth/ui/auth-dialog";
import { GenerationEventStreamProvider } from "@/features/generation/model/generation-event-stream-provider";

export function AuthProviders({ children }: { children: ReactNode }) {
  return (
    <AuthDialogProvider>
      <SessionProvider>
        <GenerationEventStreamProvider>
          {children}
          <AuthDialog />
        </GenerationEventStreamProvider>
      </SessionProvider>
    </AuthDialogProvider>
  );
}
