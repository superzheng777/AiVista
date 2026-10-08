import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GenerationComposer } from "@/features/generation/ui/generation-composer";
import { createAgentCreation, createGenerationTask } from "@/features/generation/api/generation-api";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/auth/model/auth-dialog-provider", () => ({ useAuthDialog: () => ({ open: vi.fn() }) }));
vi.mock("@/features/auth/model/session-provider", () => ({
  useSession: () => ({ status: "authenticated", user: { id: "user-1" } }),
}));
vi.mock("@/features/generation/model/generation-event-stream-provider", () => ({
  useGenerationEventStream: () => ({ ensureReady: vi.fn().mockResolvedValue(true) }),
}));
vi.mock("@/features/user-agreement/model/use-user-agreement-consent", () => ({
  useUserAgreementConsent: () => ({
    consentQuery: { isLoading: false, isError: false, data: { consented: true } },
    confirmConsent: { isPending: false, error: null, mutate: vi.fn() },
  }),
}));
vi.mock("@/features/generation/ui/generation-reference-images", () => ({
  GenerationReferenceImages: () => null,
  GenerationReferenceImagePicker: ({ onChange }: { onChange: (images: unknown[]) => void }) => (
    <button type="button" onClick={() => onChange([{ id: "asset-101" }])}>
      添加测试参考图
    </button>
  ),
}));
vi.mock("@/features/user-agreement/ui/user-agreement-consent-dialog", () => ({
  UserAgreementConsentDialog: () => null,
}));
vi.mock("@/features/generation/api/generation-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/generation/api/generation-api")>();
  return { ...actual, createAgentCreation: vi.fn(), createGenerationTask: vi.fn() };
});

describe("GenerationComposer", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.mocked(createGenerationTask).mockReset();
    vi.mocked(createAgentCreation).mockReset();
  });

  it("submits Agent mode through the Agent Creation contract without image-only parameters", async () => {
    vi.mocked(createAgentCreation).mockImplementation(() => new Promise(() => undefined));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <GenerationComposer sessionId="session-1" />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成模式" }));
    fireEvent.click(screen.getByRole("option", { name: /Agent 模式/ }));
    fireEvent.change(screen.getByLabelText("创作提示"), { target: { value: "设计一张秋日海报" } });
    fireEvent.submit(screen.getByRole("button", { name: "开始生成" }).closest("form")!);

    await waitFor(() => expect(createAgentCreation).toHaveBeenCalledTimes(1));
    expect(createAgentCreation).toHaveBeenCalledWith({
      sessionId: "session-1",
      prompt: "设计一张秋日海报",
      inputAssetIds: undefined,
      aspectRatio: "AUTO",
      imageCount: 0,
    });
    expect(createGenerationTask).not.toHaveBeenCalled();
    expect(screen.getByText("设置")).toBeInTheDocument();
  });

  it("keeps the selected Agent mode when the composer remounts after navigation", async () => {
    const firstClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const first = render(
      <QueryClientProvider client={firstClient}>
        <GenerationComposer />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "生成模式" }));
    fireEvent.click(screen.getByRole("option", { name: /Agent 模式/ }));
    expect(window.sessionStorage.getItem("aivista.generation-mode")).toBe("agent");
    first.unmount();

    vi.mocked(createAgentCreation).mockImplementation(() => new Promise(() => undefined));
    const secondClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={secondClient}>
        <GenerationComposer sessionId="session-1" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "生成模式" })).toHaveTextContent("Agent 模式"));
    fireEvent.change(screen.getByLabelText("创作提示"), { target: { value: "按你的建议来" } });
    fireEvent.submit(screen.getByRole("button", { name: "开始生成" }).closest("form")!);

    await waitFor(() => expect(createAgentCreation).toHaveBeenCalledTimes(1));
    expect(createGenerationTask).not.toHaveBeenCalled();
  });

  it("releases textarea focus when the composer collapses so clicking it can expand again", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onExpand = vi.fn();
    const view = render(
      <QueryClientProvider client={queryClient}>
        <GenerationComposer sessionId="session-1" onExpand={onExpand} />
      </QueryClientProvider>,
    );
    const prompt = screen.getByLabelText("创作提示");
    prompt.focus();
    expect(prompt).toHaveFocus();

    view.rerender(
      <QueryClientProvider client={queryClient}>
        <GenerationComposer sessionId="session-1" compact onExpand={onExpand} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(prompt).not.toHaveFocus());

    fireEvent.focus(prompt);
    expect(onExpand).toHaveBeenCalledTimes(2);
  });

  it("blocks another submission while the current session is still creating", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <GenerationComposer sessionId="session-1" hasActiveCreation />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("button", { name: "开始生成" })).toBeDisabled();
    expect(createAgentCreation).not.toHaveBeenCalled();
    expect(createGenerationTask).not.toHaveBeenCalled();
  });

  it("submits selected reference image IDs through the Agent contract", async () => {
    vi.mocked(createAgentCreation).mockImplementation(() => new Promise(() => undefined));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <GenerationComposer sessionId="session-1" />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成模式" }));
    fireEvent.click(screen.getByRole("option", { name: /Agent 模式/ }));
    fireEvent.click(screen.getByRole("button", { name: "添加测试参考图" }));
    fireEvent.change(screen.getByLabelText("创作提示"), { target: { value: "把参考图改成秋日风格" } });
    fireEvent.submit(screen.getByRole("button", { name: "开始生成" }).closest("form")!);

    await waitFor(() => expect(createAgentCreation).toHaveBeenCalledTimes(1));
    expect(createAgentCreation).toHaveBeenCalledWith({
      sessionId: "session-1",
      prompt: "把参考图改成秋日风格",
      inputAssetIds: ["asset-101"],
      aspectRatio: "AUTO",
      imageCount: 0,
    });
  });

  it("submits explicit Agent aspect ratio and image count constraints", async () => {
    vi.mocked(createAgentCreation).mockImplementation(() => new Promise(() => undefined));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <GenerationComposer sessionId="session-1" />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "生成模式" }));
    fireEvent.click(screen.getByRole("option", { name: /Agent 模式/ }));
    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    fireEvent.click(screen.getByRole("radio", { name: "3:4" }));
    fireEvent.click(screen.getByRole("radio", { name: "3" }));
    fireEvent.change(screen.getByLabelText("创作提示"), { target: { value: "生成三张竖版海报" } });
    fireEvent.submit(screen.getByRole("button", { name: "开始生成" }).closest("form")!);

    await waitFor(() =>
      expect(createAgentCreation).toHaveBeenCalledWith({
        sessionId: "session-1",
        prompt: "生成三张竖版海报",
        inputAssetIds: undefined,
        aspectRatio: "3:4",
        imageCount: 3,
      }),
    );
  });

  it("keeps each mode's image settings when switching back to normal generation", async () => {
    vi.mocked(createGenerationTask).mockImplementation(() => new Promise(() => undefined));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <GenerationComposer sessionId="session-1" />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    fireEvent.click(screen.getByRole("radio", { name: "4:3" }));
    fireEvent.click(screen.getByRole("radio", { name: "2" }));
    fireEvent.click(screen.getByRole("button", { name: "生成模式" }));
    fireEvent.click(screen.getByRole("option", { name: /Agent 模式/ }));
    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    fireEvent.click(screen.getByRole("radio", { name: "3:4" }));
    fireEvent.click(screen.getByRole("radio", { name: "3" }));
    fireEvent.click(screen.getByRole("button", { name: "生成模式" }));
    fireEvent.click(screen.getByRole("option", { name: /图片生成/ }));
    fireEvent.change(screen.getByLabelText("创作提示"), { target: { value: "画一张海报" } });
    fireEvent.submit(screen.getByRole("button", { name: "开始生成" }).closest("form")!);

    await waitFor(() =>
      expect(createGenerationTask).toHaveBeenCalledWith(expect.objectContaining({ aspectRatio: "4:3", imageCount: 2 })),
    );
    expect(createAgentCreation).not.toHaveBeenCalled();
  });
});
