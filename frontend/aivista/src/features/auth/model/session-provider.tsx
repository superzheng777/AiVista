"use client";

import { createContext, type ReactNode, use, useEffect, useMemo } from "react";

import type { CurrentUser } from "@/entities/user/model/user";
import type { LoginInput, RegisterInput, UpdateProfileInput } from "@/features/auth/api/auth-api";
import { type AuthStatus, useAuthStore } from "@/features/auth/model/auth-store";
import { configureBrowserAuth } from "@/shared/api/browser-client";

type SessionContextValue = {
  status: AuthStatus;
  user: CurrentUser | null;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  updateProfile: (input: UpdateProfileInput) => Promise<void>;
  restoreSession: () => Promise<void>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const logout = useAuthStore((state) => state.logout);
  const restoreSession = useAuthStore((state) => state.restoreSession);

  useEffect(() => configureBrowserAuth({
    getAccessToken: () => useAuthStore.getState().accessToken,
    refreshAccessToken: () => useAuthStore.getState().refreshAccessToken(),
    onSessionInvalid: () => {
      useAuthStore.getState().clearSession();
    },
  }), []);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const value = useMemo(
    () => ({ status, user, login, register, updateProfile, restoreSession, logout }),
    [status, user, login, register, updateProfile, restoreSession, logout],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionContextValue {
  const value = use(SessionContext);
  if (!value) {
    throw new Error("useSession must be used within SessionProvider.");
  }

  return value;
}
