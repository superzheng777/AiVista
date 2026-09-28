import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthDialogProvider, useAuthDialog } from "@/features/auth/model/auth-dialog-provider";
import { AuthDialog } from "@/features/auth/ui/auth-dialog";

const authApi = vi.hoisted(() => ({ getUserAgreementPolicy: vi.fn() }));
const session = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn() }));

vi.mock("@/features/auth/api/auth-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/auth/api/auth-api")>();
  return { ...actual, getUserAgreementPolicy: authApi.getUserAgreementPolicy };
});

vi.mock("@/features/auth/model/session-provider", () => ({
  useSession: () => session,
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

  it("submits validated registration values and clears the password afterward", async () => {
    render(
      <AuthDialogProvider>
        <AuthDialogTrigger />
        <AuthDialog />
      </AuthDialogProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "打开登录" }));
    fireEvent.click(screen.getByRole("button", { name: "去注册" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /我已阅读并同意/ })).toBeEnabled());
    fireEvent.change(screen.getByPlaceholderText("请输入账号"), { target: { value: "alice_2026" } });
    fireEvent.change(screen.getByPlaceholderText("请输入昵称"), { target: { value: " Alice " } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "Aivista2026" } });
    fireEvent.change(screen.getByLabelText("确认密码"), { target: { value: "Aivista2026" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /我已阅读并同意/ }));
    fireEvent.click(screen.getByRole("button", { name: "注册" }));

    await waitFor(() =>
      expect(session.register).toHaveBeenCalledWith({
        loginName: "alice_2026",
        nickname: "Alice",
        password: "Aivista2026",
        agreementPolicyVersion: "v1",
      }),
    );
    expect(screen.getByLabelText("密码")).toHaveValue("");
    expect(screen.getByText("注册成功，请使用新账号登录。")).toBeInTheDocument();
  });
});
