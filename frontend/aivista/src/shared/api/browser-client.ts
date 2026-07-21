import axios, { type InternalAxiosRequestConfig } from "axios";

import type { ApiResponse } from "@/shared/api/api-response";

/** Browser-side client. All calls use Next.js's same-origin /api proxy. */
export const browserApiClient = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

type BrowserAuthHandlers = {
  getAccessToken: () => string | null;
  refreshAccessToken: () => Promise<string>;
  onSessionInvalid: () => void;
};

type RetriableRequestConfig = InternalAxiosRequestConfig & {
  __aivistaRetried?: boolean;
};

let authHandlers: BrowserAuthHandlers | null = null;
let refreshPromise: Promise<string> | null = null;

function isAuthRequest(url?: string): boolean {
  return url?.startsWith("/auth/") ?? false;
}

function refreshSingleFlight(): Promise<string> {
  if (!authHandlers) {
    return Promise.reject(new Error("Authentication has not been configured."));
  }

  refreshPromise ??= authHandlers.refreshAccessToken().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

browserApiClient.interceptors.request.use((config) => {
  const accessToken = authHandlers?.getAccessToken();
  if (accessToken && !isAuthRequest(config.url)) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

browserApiClient.interceptors.response.use(undefined, async (error: unknown) => {
  if (!axios.isAxiosError<ApiResponse<unknown>>(error) || !error.config) {
    return Promise.reject(error);
  }

  const responseCode = error.response?.data?.code;
  const config = error.config as RetriableRequestConfig;

  if (responseCode === 40102 && !isAuthRequest(config.url)) {
    authHandlers?.onSessionInvalid();
    return Promise.reject(error);
  }

  if (responseCode !== 40100 || isAuthRequest(config.url) || config.__aivistaRetried) {
    return Promise.reject(error);
  }

  config.__aivistaRetried = true;
  try {
    const accessToken = await refreshSingleFlight();
    config.headers.Authorization = `Bearer ${accessToken}`;
    return browserApiClient.request(config);
  } catch (refreshError) {
    authHandlers?.onSessionInvalid();
    return Promise.reject(refreshError);
  }
});

/** Configured by the session provider; shared API code never imports auth state. */
export function configureBrowserAuth(nextHandlers: BrowserAuthHandlers): () => void {
  authHandlers = nextHandlers;

  return () => {
    if (authHandlers === nextHandlers) {
      authHandlers = null;
    }
  };
}
