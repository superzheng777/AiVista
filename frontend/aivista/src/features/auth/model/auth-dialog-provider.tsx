"use client";

import { createContext, type ReactNode, use, useMemo, useState } from "react";

type AuthDialogContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
};

const AuthDialogContext = createContext<AuthDialogContextValue | null>(null);

export function AuthDialogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const value = useMemo(
    () => ({ isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) }),
    [isOpen],
  );

  return <AuthDialogContext value={value}>{children}</AuthDialogContext>;
}

export function useAuthDialog(): AuthDialogContextValue {
  const value = use(AuthDialogContext);
  if (!value) {
    throw new Error("useAuthDialog must be used within AuthDialogProvider.");
  }

  return value;
}
