"use client";

import { AuthInitializer } from "@/features/auth/model/auth-initializer";
import { AuthDialog } from "@/features/auth/ui/auth-dialog";
import { QueryProvider } from "@/shared/api/query-provider";
import type { ReactNode } from "react";
import { UserEventStreamInitializer } from "./_bootstrap/user-event-stream-initializer";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <AuthInitializer />
      <UserEventStreamInitializer />
      {children}
      <AuthDialog />
    </QueryProvider>
  );
}
