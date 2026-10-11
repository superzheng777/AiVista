"use client";

import type { ReactNode } from "react";
import { AuthInitializer } from "@/features/auth/model/auth-initializer";
import { AuthDialog } from "@/features/auth/ui/auth-dialog";
import { GenerationEventStreamInitializer } from "@/features/generation/model/generation-event-stream-initializer";
import { QueryProvider } from "@/shared/api/query-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <AuthInitializer />
      <GenerationEventStreamInitializer />
      {children}
      <AuthDialog />
    </QueryProvider>
  );
}
