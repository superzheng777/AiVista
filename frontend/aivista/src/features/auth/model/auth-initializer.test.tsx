import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentUser } from "@/entities/user/model/user";
import { useAuthStore } from "./auth-store";
import { useAuthDialogStore } from "./auth-dialog-store";
import { AuthInitializer } from "./auth-initializer";

const authBridge = vi.hoisted(() => ({ configure: vi.fn(), cleanup: vi.fn() }));
vi.mock("@/shared/api/browser-client", () => ({ configureBrowserAuth: authBridge.configure }));

const initial = useAuthStore.getState();
const user: CurrentUser = {
  id: "viewer-a",
  nickname: "Test",
  loginName: "test-viewer",
  avatarUrl: null,
  bio: null,
  createdAt: "2026-10-01",
  updatedAt: "2026-10-01",
};
let client: QueryClient;

beforeEach(() => {
  vi.clearAllMocks();
  authBridge.configure.mockReturnValue(authBridge.cleanup);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useAuthStore.setState({
    ...initial,
    restoreSession: vi.fn().mockResolvedValue(undefined),
    status: "authenticated",
    user,
  });
  render(
    <QueryClientProvider client={client}>
      <AuthInitializer />
    </QueryClientProvider>,
  );
  client.setQueryData(["assets"], ["private-asset-a"]);
  client.setQueryData(["inspirations", "discovery"], { viewerLiked: true });
});

afterEach(() => {
  cleanup();
  client.clear();
  useAuthStore.setState(initial, true);
});

describe("session resource cache isolation", () => {
  it("preserves cached lists for profile edits, token changes and recoverable connection errors", () => {
    act(() => useAuthStore.setState({ user: { ...user, nickname: "Edited" }, accessToken: "test-token" }));
    expect(client.getQueryData(["assets"])).toEqual(["private-asset-a"]);
    act(() => useAuthStore.setState({ status: "error" }));
    act(() => useAuthStore.setState({ status: "authenticated" }));
    expect(client.getQueryData(["inspirations", "discovery"])).toEqual({ viewerLiked: true });
  });

  it("discards private assets and viewer-specific public state when the identity changes or logs out", () => {
    act(() => useAuthStore.setState({ user: { ...user, id: "viewer-b" } }));
    expect(client.getQueryData(["assets"])).toBeUndefined();
    expect(client.getQueryData(["inspirations", "discovery"])).toBeUndefined();
    client.setQueryData(["assets"], ["private-asset-b"]);
    act(() => useAuthStore.setState({ status: "anonymous", user: null }));
    expect(client.getQueryCache().getAll()).toEqual([]);
  });
});

it("restores authentication, configures the Axios bridge and releases UI state on unmount", () => {
  expect(useAuthStore.getState().restoreSession).toHaveBeenCalledOnce();
  expect(authBridge.configure).toHaveBeenCalledOnce();
  const bridge = authBridge.configure.mock.calls[0]![0];
  act(() => useAuthStore.setState({ accessToken: "new-token" }));
  expect(bridge.getAccessToken()).toBe("new-token");
  useAuthDialogStore.getState().open();
  cleanup();
  expect(authBridge.cleanup).toHaveBeenCalledOnce();
  expect(useAuthDialogStore.getState().isOpen).toBe(false);
});
