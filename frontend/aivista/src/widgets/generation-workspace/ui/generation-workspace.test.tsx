import type { SessionDetail, SessionSummary } from "@/entities/creation-session/model/session";
import { useUserEventStreamStore } from "@/entities/user-event-stream/model/user-event-stream-store";
import {
  deleteGenerationSession,
  generationQueryKeys,
  getGenerationSession,
  listGenerationSessions,
  updateGenerationSessionTitle,
} from "@/features/generation/api/generation-api";
import { receiveCreationEvent } from "@/features/generation/model/session-events";
import { sessionFixture } from "@/features/generation/model/session-events.test-fixture";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GenerationWorkspace } from "./generation-workspace";

const route = vi.hoisted(() => ({ search: "sessionId=1" }));

const navigate = vi.fn();

const replaceHistory = vi.fn();

const pushHistory = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigate }),
  useSearchParams: () => new URLSearchParams(route.search),
}));

vi.mock("@/features/generation/api/generation-api", async (original) => ({
  ...(await original<typeof import("@/features/generation/api/generation-api")>()),
  listGenerationSessions: vi.fn().mockResolvedValue([]),
  getGenerationSession: vi.fn(),
  updateGenerationSessionTitle: vi.fn(),
  deleteGenerationSession: vi.fn(),
}));

const acknowledge = vi.fn();

vi.mock("@/features/generation/ui/generation-composer", () => ({
  GenerationComposer: ({ hasActiveCreation }: { hasActiveCreation: boolean }) => (
    <button disabled={hasActiveCreation}>提交创作</button>
  ),
}));

let desktop = true;

const mediaListeners = new Set<() => void>();

beforeEach(() => {
  useUserEventStreamStore.setState(
    { ...useUserEventStreamStore.getInitialState(), acknowledgeSession: acknowledge },
    true,
  );
  route.search = "sessionId=1";
  desktop = true;
  mediaListeners.clear();
  vi.spyOn(window.history, "pushState").mockImplementation(pushHistory);
  vi.spyOn(window.history, "replaceState").mockImplementation(replaceHistory);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return desktop;
      },
      addEventListener: (_event: string, callback: () => void) => mediaListeners.add(callback),
      removeEventListener: (_event: string, callback: () => void) => mediaListeners.delete(callback),
    })),
  );
  Element.prototype.scrollTo = vi.fn();
  vi.mocked(listGenerationSessions).mockResolvedValue([]);
  vi.mocked(updateGenerationSessionTitle).mockReset();
  vi.mocked(deleteGenerationSession).mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GenerationWorkspace", () => {
  async function beginRename(title: string) {
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: `会话操作：${title}` }));
    expect(await screen.findByRole("menuitem", { name: "删除" })).not.toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("menuitem", { name: "重命名" }));
    const input = screen.getByRole("textbox", { name: "会话名称" });
    expect(input).toHaveFocus();
    expect(screen.queryByRole("button", { name: "保存会话名称" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "取消修改会话名称" })).not.toBeInTheDocument();
    return input;
  }

  async function deleteFromMenu(title: string) {
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: `会话操作：${title}` }));
    await user.click(await screen.findByRole("menuitem", { name: "删除" }));
  }

  it("waits for deletion success before removing the current session and returning to a new conversation", async () => {
    const data = sessionFixture();
    vi.mocked(getGenerationSession).mockResolvedValue(data);
    vi.mocked(listGenerationSessions).mockResolvedValue([data]);
    let finish!: () => void;
    vi.mocked(deleteGenerationSession).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GenerationWorkspace />
      </QueryClientProvider>,
    );
    await screen.findByText("制作海报");
    await deleteFromMenu("海报设计");
    expect(deleteGenerationSession).toHaveBeenCalledWith("1");
    expect(screen.getByRole("button", { name: /^海报设计/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "会话操作：海报设计" })).toBeDisabled();
    expect(replaceHistory).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(await screen.findByText("你好，想创作什么？")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^海报设计/ })).not.toBeInTheDocument();
    expect(replaceHistory).toHaveBeenCalledWith(null, "", "/generate");
    expect(acknowledge).toHaveBeenCalledWith("1");
    expect(client.getQueryData(generationQueryKeys.session("1"))).toBeUndefined();
    expect(client.getQueryData(generationQueryKeys.sessions())).toEqual([]);
    expect(
      receiveCreationEvent(client, {
        type: "creation.updated",
        sessionId: "1",
        creationId: "2",
        status: "SUCCEEDED",
        revision: 2,
      }),
    ).toBe(false);
    client.clear();
  });

  it("deletes another session without navigating or changing the current conversation", async () => {
    const current = sessionFixture();
    const other = { ...current, sessionId: "other", title: "另一会话" };
    vi.mocked(getGenerationSession).mockResolvedValue(current);
    vi.mocked(listGenerationSessions).mockResolvedValue([current, other]);
    vi.mocked(deleteGenerationSession).mockResolvedValue();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(generationQueryKeys.session("other"), other);
    render(
      <QueryClientProvider client={client}>
        <GenerationWorkspace />
      </QueryClientProvider>,
    );
    await screen.findByText("制作海报");
    await deleteFromMenu("另一会话");
    await waitFor(() => expect(screen.queryByRole("button", { name: "另一会话" })).not.toBeInTheDocument());
    expect(screen.getByText("制作海报")).toBeInTheDocument();
    expect(replaceHistory).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(client.getQueryData(generationQueryKeys.session("other"))).toBeUndefined();
    expect(client.getQueryData(generationQueryKeys.session("1"))).toBeDefined();
    expect(client.getQueryData(generationQueryKeys.sessions())).toEqual([current]);
    client.clear();
  });

  it.each([
    [
      { isAxiosError: true, response: { status: 409, data: { code: 40908, message: "当前会话已有创作正在进行" } } },
      "当前会话已有创作正在进行",
    ],
    [new Error("offline"), "会话删除失败，请重试。"],
  ])("preserves history on deletion failure and allows retry", async (error, message) => {
    const data = sessionFixture();
    vi.mocked(getGenerationSession).mockResolvedValue(data);
    vi.mocked(listGenerationSessions).mockResolvedValue([data]);
    vi.mocked(deleteGenerationSession).mockRejectedValueOnce(error).mockResolvedValueOnce();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GenerationWorkspace />
      </QueryClientProvider>,
    );
    await screen.findByText("制作海报");
    await deleteFromMenu("海报设计");
    expect(await screen.findByRole("alert")).toHaveTextContent(message as string);
    expect(screen.getByRole("button", { name: /^海报设计/ })).toBeInTheDocument();
    expect(client.getQueryData(generationQueryKeys.session("1"))).toBeDefined();
    expect(client.getQueryData(generationQueryKeys.sessions())).toEqual([data]);
    expect(replaceHistory).not.toHaveBeenCalled();
    await deleteFromMenu("海报设计");
    expect(await screen.findByText("你好，想创作什么？")).toBeInTheDocument();
    expect(deleteGenerationSession).toHaveBeenCalledTimes(2);
    client.clear();
  });

  it("renames the current session from the sidebar and keeps the asset link outside the history scroller", async () => {
    const data = sessionFixture();
    vi.mocked(getGenerationSession).mockResolvedValue(data);
    vi.mocked(listGenerationSessions).mockResolvedValue([data]);
    vi.mocked(updateGenerationSessionTitle).mockResolvedValue({ sessionId: "1", title: "新海报名称" });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GenerationWorkspace />
      </QueryClientProvider>,
    );
    const sidebar = screen.getByRole("navigation", { name: "历史会话" });
    const input = await beginRename("海报设计");
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "  新海报名称  " } });
    await userEvent.setup().keyboard("{Enter}");
    await waitFor(() => expect(updateGenerationSessionTitle).toHaveBeenCalledWith("1", "新海报名称"));
    expect(await within(sidebar).findByText("新海报名称")).toBeInTheDocument();
    expect(client.getQueryData<SessionDetail>(generationQueryKeys.session("1"))?.title).toBe("新海报名称");
    expect(client.getQueryData<SessionSummary[]>(generationQueryKeys.sessions())?.[0]?.title).toBe("新海报名称");
    expect(screen.getByRole("main").querySelector("header")).toBeNull();
    const assets = screen.getByRole("link", { name: "资产库" });
    expect(assets).toHaveAttribute("href", "/assets");
    expect(screen.getByLabelText("当前会话历史")).not.toContainElement(assets);
    client.clear();
  });

  it("renames another sidebar session without navigating or changing the current session title", async () => {
    const current = sessionFixture();
    const other = { ...sessionFixture(), sessionId: "other", title: "另一会话" };
    vi.mocked(getGenerationSession).mockResolvedValue(current);
    vi.mocked(listGenerationSessions).mockResolvedValue([current, other]);
    vi.mocked(updateGenerationSessionTitle).mockResolvedValue({ sessionId: "other", title: "另一会话新名称" });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(generationQueryKeys.session("other"), other);
    render(
      <QueryClientProvider client={client}>
        <GenerationWorkspace />
      </QueryClientProvider>,
    );
    const input = await beginRename("另一会话");
    fireEvent.change(input, { target: { value: "另一会话新名称" } });
    await userEvent.setup().click(screen.getByRole("main"));
    expect(await screen.findByText("另一会话新名称")).toBeInTheDocument();
    expect(updateGenerationSessionTitle).toHaveBeenCalledWith("other", "另一会话新名称");
    expect(navigate).not.toHaveBeenCalled();
    expect(client.getQueryData<SessionDetail>(generationQueryKeys.session("1"))?.title).toBe("海报设计");
    expect(client.getQueryData<SessionDetail>(generationQueryKeys.session("other"))?.title).toBe("另一会话新名称");
    fireEvent.click(screen.getByRole("button", { name: "另一会话新名称" }));
    expect(navigate).toHaveBeenCalledWith("/generate?sessionId=other");
    client.clear();
  });

  it("keeps failed edits available for retry and supports cancelling without saving", async () => {
    const data = sessionFixture();
    vi.mocked(getGenerationSession).mockResolvedValue(data);
    vi.mocked(listGenerationSessions).mockResolvedValue([data]);
    vi.mocked(updateGenerationSessionTitle).mockRejectedValueOnce(new Error("offline"));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GenerationWorkspace />
      </QueryClientProvider>,
    );
    const input = await beginRename("海报设计");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.submit(input.closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("请输入会话名称");
    expect(updateGenerationSessionTitle).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "字".repeat(101) } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("会话名称不能超过 100 字"));
    expect(updateGenerationSessionTitle).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "待保存名称" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("名称修改失败，请重试。"));
    expect(input).toHaveValue("待保存名称");
    expect(client.getQueryData<SessionSummary[]>(generationQueryKeys.sessions())?.[0]?.title).toBe("海报设计");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: "会话名称" })).not.toBeInTheDocument();
    const reopened = await beginRename("海报设计");
    expect(reopened).toHaveValue("海报设计");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("main"));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "会话名称" })).not.toBeInTheDocument());
    expect(updateGenerationSessionTitle).toHaveBeenCalledTimes(1);
    client.clear();
  });

  it("sends only one rename when submit and blur happen together", async () => {
    const data = sessionFixture();
    vi.mocked(getGenerationSession).mockResolvedValue(data);
    vi.mocked(listGenerationSessions).mockResolvedValue([data]);
    let finish!: (value: { sessionId: string; title: string }) => void;
    vi.mocked(updateGenerationSessionTitle).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GenerationWorkspace />
      </QueryClientProvider>,
    );
    const input = await beginRename("海报设计");
    fireEvent.change(input, { target: { value: "新名称" } });
    fireEvent.submit(input.closest("form")!);
    fireEvent.blur(input);
    await waitFor(() => expect(updateGenerationSessionTitle).toHaveBeenCalledTimes(1));
    await act(async () => finish({ sessionId: "1", title: "新名称" }));
    expect(await screen.findByText("新名称")).toBeInTheDocument();
    expect(updateGenerationSessionTitle).toHaveBeenCalledTimes(1);
    client.clear();
  });

  it("renders history and SSE into the same turn without refetching history", async () => {
    vi.mocked(getGenerationSession).mockResolvedValue(sessionFixture());
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GenerationWorkspace />
      </QueryClientProvider>,
    );
    await screen.findByText("制作海报");
    await act(async () =>
      receiveCreationEvent(client, {
        type: "creation.item.upserted",
        sessionId: "1",
        creationId: "2",
        item: { id: "text-1", kind: "text", phase: "process", text: "正在设计新的海报" },
      }),
    );
    expect(await screen.findByText("正在设计新的海报")).toBeInTheDocument();
    expect(getGenerationSession).toHaveBeenCalledOnce();
    client.clear();
  });
  it("disables new creation at the limit using a constructed session", async () => {
    const data = sessionFixture();
    data.creationCount = 30;
    data.turns[0]!.status = "SUCCEEDED";
    vi.mocked(getGenerationSession).mockResolvedValue(data);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GenerationWorkspace />
      </QueryClientProvider>,
    );
    await screen.findByText(/已达到30轮/);
    expect(screen.getByRole("button", { name: "提交创作" })).toBeDisabled();
    client.clear();
  });
});

describe("generation navigation", () => {
  function renderWorkspace() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GenerationWorkspace />
      </QueryClientProvider>,
    );
    return client;
  }

  it("shows the shared controls on a new conversation and allows the desktop sidebar to collapse", async () => {
    route.search = "";
    const client = renderWorkspace();
    expect(screen.getByRole("link", { name: "资产库" })).toHaveAttribute("href", "/assets");
    expect(screen.getByText("你好，想创作什么？")).toBeVisible();
    const sidebar = screen.getByRole("complementary", { name: "会话侧栏" });
    fireEvent.click(screen.getByRole("button", { name: "收起会话侧栏" }));
    expect(screen.queryByRole("complementary", { name: "会话侧栏" })).not.toBeInTheDocument();
    expect(sidebar).toBeInTheDocument();
    expect(sidebar).toHaveAttribute("inert");
    expect(sidebar).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button", { name: "展开会话侧栏" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "展开会话侧栏" }));
    expect(screen.getByRole("complementary", { name: "会话侧栏" })).toBe(sidebar);
    expect(sidebar).not.toHaveAttribute("inert");
    client.clear();
  });

  it("keeps the existing conversation mounted when toggling its sidebar", async () => {
    vi.mocked(getGenerationSession).mockResolvedValue(sessionFixture());
    const client = renderWorkspace();
    await screen.findByText("制作海报");
    const history = screen.getByLabelText("当前会话历史");
    expect(screen.getByRole("link", { name: "资产库" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "收起会话侧栏" }));
    expect(screen.getByLabelText("当前会话历史")).toBe(history);
    fireEvent.click(screen.getByRole("button", { name: "展开会话侧栏" }));
    expect(screen.getByLabelText("当前会话历史")).toBe(history);
    client.clear();
  });

  it("opens a mobile drawer and dismisses it after selecting a session or starting a new conversation", async () => {
    desktop = false;
    route.search = "";
    vi.mocked(listGenerationSessions).mockResolvedValue([sessionFixture()]);
    const client = renderWorkspace();
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "展开会话侧栏" });
    await user.click(trigger);
    const drawer = await screen.findByRole("dialog", { name: "会话侧栏" });
    await user.click(await within(drawer).findByRole("button", { name: /^海报设计/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(navigate).toHaveBeenCalledWith("/generate?sessionId=1");
    await user.click(trigger);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "新对话" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(pushHistory).toHaveBeenCalledWith(null, "", "/generate");
    client.clear();
  });

  it("supports Escape with focus restoration and releases the drawer when resizing to desktop", async () => {
    desktop = false;
    route.search = "";
    const client = renderWorkspace();
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "展开会话侧栏" });
    await user.click(trigger);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(trigger);
    act(() => {
      desktop = true;
      mediaListeners.forEach((notify) => notify());
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("complementary", { name: "会话侧栏" })).toBeInTheDocument();
    act(() => {
      desktop = false;
      mediaListeners.forEach((notify) => notify());
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开会话侧栏" })).toHaveAttribute("aria-expanded", "false");
    client.clear();
  });
});
