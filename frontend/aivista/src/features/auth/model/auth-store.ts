"use client";

import { isAxiosError } from "axios";
import { create } from "zustand";

import type { CurrentUser } from "@/entities/user/model/user";
import * as authApi from "@/features/auth/api/auth-api";
import type { ApiResponse } from "@/shared/api/api-response";

export type AuthStatus = "loading" | "anonymous" | "authenticated";

type AuthStore = {
  accessToken: string | null;
  user: CurrentUser | null;
  status: AuthStatus;
  login: (input: authApi.LoginInput) => Promise<void>;
  register: (input: authApi.RegisterInput) => Promise<void>;
  updateProfile: (input: authApi.UpdateProfileInput) => Promise<void>;
  restoreSession: () => Promise<void>;
  refreshAccessToken: () => Promise<string>;
  clearSession: () => void;
  logout: () => Promise<void>;
};

function messageFrom(error: unknown, fallback: string): string {
  if (isAxiosError<ApiResponse<unknown>>(error)) {
    return error.response?.data?.message ?? fallback;
  }

  return error instanceof Error ? error.message : fallback;
}

export const useAuthStore = create<AuthStore>((set) => ({
  accessToken: null,
  user: null,
  status: "loading",

  async login(input) {
    try {
      const session = await authApi.login(input);
      set({ ...session, status: "authenticated" });
    } catch (error) {
      set({ accessToken: null, user: null, status: "anonymous" });
      throw new Error(messageFrom(error, "登录失败，请稍后重试。"));
    }
  },

  async register(input) {
    try {
      await authApi.register(input);
    } catch (error) {
      throw new Error(messageFrom(error, "注册失败，请稍后重试。"));
    }
  },

  async updateProfile(input) {
    const accessToken = useAuthStore.getState().accessToken;
    if (!accessToken) {
      throw new Error("请先登录后再修改个人资料。");
    }

    try {
      const user = await authApi.updateCurrentUser(input, accessToken);
      set({ user });
    } catch (error) {
      throw new Error(messageFrom(error, "保存个人资料失败，请稍后重试。"));
    }
  },

  async restoreSession() {
    try {
      const accessToken = await authApi.refreshAccessToken();
      const user = await authApi.getCurrentUser(accessToken);
      set({ accessToken, user, status: "authenticated" });
    } catch {
      set({ accessToken: null, user: null, status: "anonymous" });
    }
  },

  async refreshAccessToken() {
    try {
      const accessToken = await authApi.refreshAccessToken();
      set({ accessToken });
      return accessToken;
    } catch (error) {
      set({ accessToken: null, user: null, status: "anonymous" });
      throw error;
    }
  },

  clearSession() {
    set({ accessToken: null, user: null, status: "anonymous" });
  },

  async logout() {
    try {
      await authApi.logout();
    } finally {
      set({ accessToken: null, user: null, status: "anonymous" });
    }
  },
}));
