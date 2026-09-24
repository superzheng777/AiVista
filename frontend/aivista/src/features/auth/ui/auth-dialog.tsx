"use client";

import { Eye, EyeOff, LockKeyhole, UserRound, X } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { getUserAgreementPolicy, type UserAgreementPolicy } from "@/features/auth/api/auth-api";
import { useAuthDialog } from "@/features/auth/model/auth-dialog-provider";
import { useSession } from "@/features/auth/model/session-provider";

type Mode = "login" | "register";

export function AuthDialog() {
  const { isOpen } = useAuthDialog();

  return isOpen ? <OpenAuthDialog /> : null;
}

function OpenAuthDialog() {
  const { close } = useAuthDialog();
  const { login, register } = useSession();
  const mountedRef = useRef(true);
  const [mode, setMode] = useState<Mode>("login");
  const [loginName, setLoginName] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hasAcceptedAgreement, setHasAcceptedAgreement] = useState(false);
  const [agreementPolicy, setAgreementPolicy] = useState<UserAgreementPolicy | null>(null);
  const [isAgreementLoading, setIsAgreementLoading] = useState(false);
  const [isAgreementOpen, setIsAgreementOpen] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close]);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  async function loadAgreementPolicy(): Promise<void> {
    if (agreementPolicy || isAgreementLoading) return;
    setIsAgreementLoading(true);
    try {
      const policy = await getUserAgreementPolicy();
      if (mountedRef.current) setAgreementPolicy(policy);
    } catch {
      if (mountedRef.current) setError("无法加载用户协议，请稍后重试。");
    } finally {
      if (mountedRef.current) setIsAgreementLoading(false);
    }
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setHasAcceptedAgreement(false);
    if (nextMode === "register") void loadAgreementPolicy();
    setError("");
    setNotice("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (mode === "register" && password !== confirmPassword) {
      setError("两次输入的密码不一致，请重新确认。");
      return;
    }

    const policy = agreementPolicy;
    if (mode === "register" && (!hasAcceptedAgreement || !policy)) {
      setError("请先阅读并同意用户协议。");
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === "login") {
        await login({ loginName: loginName.trim(), password });
        close();
      } else {
        if (!policy) return;
        await register({
          loginName: loginName.trim(),
          password,
          nickname: nickname.trim(),
          agreementPolicyVersion: policy.policyVersion,
        });
        setMode("login");
        setPassword("");
        setConfirmPassword("");
        setNotice("注册成功，请使用新账号登录。");
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "操作失败，请稍后重试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  const isLogin = mode === "login";

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) close();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
        className="w-full max-w-[25rem] rounded-[10px] border border-[var(--border)] bg-[var(--surface-bg)] p-6 shadow-[0_28px_90px_-28px_var(--shadow)] sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium tracking-[0.18em] text-[var(--accent)]">AIVISTA</p>
            <h1 id="auth-dialog-title" className="mt-2 text-2xl font-semibold tracking-tight text-card-foreground">
              {isLogin ? "账号登录" : "注册账号"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isLogin ? "输入你的账号和密码" : "创建账号，开始你的视觉创作"}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="关闭登录窗口"
            className="grid size-8 place-items-center rounded-[6px] text-[var(--text-secondary)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <X className="size-4" />
          </button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="sr-only">登录账号</span>
            <span className="relative block">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={loginName}
                onChange={(event) => setLoginName(event.target.value)}
                autoComplete="username"
                required
                minLength={4}
                maxLength={32}
                className="h-11 w-full rounded-[7px] border border-[var(--border)] bg-[var(--surface-bg)] py-2 pl-10 pr-3 text-sm text-[var(--primary)] outline-none transition placeholder:text-[var(--placeholder)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-border)]"
                placeholder="请输入账号"
              />
            </span>
          </label>

          {isLogin ? null : (
            <label className="block">
              <span className="sr-only">昵称</span>
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                autoComplete="nickname"
                required
                minLength={1}
                maxLength={32}
                className="h-11 w-full rounded-[7px] border border-[var(--border)] bg-[var(--surface-bg)] px-3 text-sm text-[var(--primary)] outline-none transition placeholder:text-[var(--placeholder)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-border)]"
                placeholder="请输入昵称"
              />
            </label>
          )}

          <PasswordField
            label="密码"
            value={password}
            onChange={setPassword}
            autoComplete={isLogin ? "current-password" : "new-password"}
            placeholder="请输入密码"
            isVisible={isPasswordVisible}
            onToggleVisibility={() => setIsPasswordVisible((value) => !value)}
          />

          {isLogin ? null : (
            <PasswordField
              label="确认密码"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              placeholder="请再次输入密码"
              isVisible={isConfirmPasswordVisible}
              onToggleVisibility={() => setIsConfirmPasswordVisible((value) => !value)}
            />
          )}

          {isLogin ? null : (
            <label className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1 text-xs leading-5 text-muted-foreground">
              <input
                type="checkbox"
                checked={hasAcceptedAgreement}
                onChange={(event) => setHasAcceptedAgreement(event.target.checked)}
                disabled={isAgreementLoading || !agreementPolicy}
                className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
              />
              <span>
                我已阅读并同意
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    setIsAgreementOpen(true);
                  }}
                  disabled={!agreementPolicy}
                  className="mx-1 font-medium text-[var(--accent)] underline underline-offset-2 transition hover:text-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:text-[var(--text-muted)]"
                >
                  《用户协议》
                </button>
                {isAgreementLoading ? "加载中…" : null}
              </span>
            </label>
          )}

          {error ? <p className="rounded-[7px] bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          {notice ? (
            <p className="rounded-[7px] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--accent-hover)]">
              {notice}
            </p>
          ) : null}

          <div className="pt-1 text-right text-xs text-muted-foreground">
            {isLogin ? (
              <span>
                还没有账号？{" "}
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className="font-medium text-[var(--accent)] transition hover:text-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  去注册
                </button>
              </span>
            ) : (
              <span>
                已有账号？{" "}
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="font-medium text-[var(--accent)] transition hover:text-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  去登录
                </button>
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting || (!isLogin && (isAgreementLoading || !agreementPolicy))}
            className="h-11 w-full rounded-[7px] bg-[var(--primary)] text-sm font-medium text-[var(--surface-bg)] transition hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-bg)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "处理中…" : isLogin ? "登录" : "注册"}
          </button>
        </form>
      </section>
      {isAgreementOpen && agreementPolicy ? (
        <UserAgreementDialog policy={agreementPolicy} onClose={() => setIsAgreementOpen(false)} />
      ) : null}
    </div>
  );
}

function UserAgreementDialog({ policy, onClose }: { policy: UserAgreementPolicy; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-10 grid place-items-center bg-[var(--overlay)] p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-agreement-title"
        className="w-full max-w-lg rounded-[10px] border border-[var(--border)] bg-[var(--surface-bg)] p-5 shadow-xl"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="user-agreement-title" className="text-base font-semibold text-[var(--primary)]">
            用户协议
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭用户协议"
            className="grid size-8 place-items-center rounded-[6px] text-[var(--text-secondary)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-4 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-[7px] bg-[var(--surface-soft)] p-4 text-sm leading-6 text-[var(--text-secondary)]">
          {policy.policyContent}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 h-10 w-full rounded-[7px] bg-[var(--primary)] text-sm font-medium text-[var(--surface-bg)] transition hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-bg)]"
        >
          我已阅读
        </button>
      </section>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  isVisible,
  onToggleVisibility,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  placeholder: string;
  isVisible: boolean;
  onToggleVisibility: () => void;
}) {
  const VisibilityIcon = isVisible ? EyeOff : Eye;
  const toggleLabel = isVisible ? "隐藏密码" : "显示密码";

  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <span className="relative block">
        <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={isVisible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={8}
          maxLength={64}
          className="h-11 w-full rounded-[7px] border border-[var(--border)] bg-[var(--surface-bg)] py-2 pl-10 pr-10 text-sm text-[var(--primary)] outline-none transition placeholder:text-[var(--placeholder)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-border)]"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={onToggleVisibility}
          aria-label={toggleLabel}
          className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-[6px] text-[var(--text-secondary)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <VisibilityIcon className="size-4" />
        </button>
      </span>
    </label>
  );
}
