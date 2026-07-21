"use client";

import type { ReactNode } from "react";

import { AuthDialogProvider } from "@/features/auth/model/auth-dialog-provider";
import { SessionProvider } from "@/features/auth/model/session-provider";
import { AuthDialog } from "@/features/auth/ui/auth-dialog";

export function AuthProviders({ children }: { children: ReactNode }) {
  return (
    <AuthDialogProvider>
      <SessionProvider>
        {children}
        <AuthDialog />
      </SessionProvider>
    </AuthDialogProvider>
  );
}
