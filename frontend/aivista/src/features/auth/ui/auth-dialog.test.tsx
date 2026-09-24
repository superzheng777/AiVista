import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthDialogProvider, useAuthDialog } from "@/features/auth/model/auth-dialog-provider";
import { AuthDialog } from "@/features/auth/ui/auth-dialog";

const authApi = vi.hoisted(() => ({ getUserAgreementPolicy: vi.fn() }));

vi.mock("@/features/auth/api/auth-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/auth/api/auth-api")>();
  return { ...actual, getUserAgreementPolicy: authApi.getUserAgreementPolicy };
});

vi.mock("@/features/auth/model/session-provider", () => ({
  useSession: () => ({ login: vi.fn(), register: vi.fn() }),
}));

function AuthDialogTrigger() {
  const { open } = useAuthDialog();
  return (
    <button type="button" onClick={open}>
      打开登录
    </button>
  );
}

describe("AuthDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authApi.getUserAgreementPolicy.mockResolvedValue({ policyVersion: "v1", policyContent: "测试协议" });
  });

  it("clears the password and hides it again after the dialog is closed", () => {
    render(
      <AuthDialogProvider>
        <AuthDialogTrigger />
        <AuthDialog />
      </AuthDialogProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开登录" }));
    const password = screen.getByLabelText("密码");
    fireEvent.change(password, { target: { value: "secret-password" } });
    fireEvent.click(screen.getByRole("button", { name: "显示密码" }));
    expect(password).toHaveValue("secret-password");
    expect(password).toHaveAttribute("type", "text");

    fireEvent.click(screen.getByRole("button", { name: "关闭登录窗口" }));
    fireEvent.click(screen.getByRole("button", { name: "打开登录" }));

    expect(screen.getByLabelText("密码")).toHaveValue("");
    expect(screen.getByLabelText("密码")).toHaveAttribute("type", "password");
  });

  it("retries loading the agreement after returning to registration", async () => {
    authApi.getUserAgreementPolicy
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({ policyVersion: "v1", policyContent: "测试协议" });
    render(
      <AuthDialogProvider>
        <AuthDialogTrigger />
        <AuthDialog />
      </AuthDialogProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开登录" }));
    fireEvent.click(screen.getByRole("button", { name: "去注册" }));
    await screen.findByText("无法加载用户协议，请稍后重试。");

    fireEvent.click(screen.getByRole("button", { name: "去登录" }));
    fireEvent.click(screen.getByRole("button", { name: "去注册" }));

    await waitFor(() => expect(authApi.getUserAgreementPolicy).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("checkbox", { name: /我已阅读并同意/ })).toBeEnabled();
  });
});
