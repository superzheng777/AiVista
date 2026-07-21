"use client";

import { Eye, EyeOff, LockKeyhole, UserRound, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { useAuthDialog } from "@/features/auth/model/auth-dialog-provider";
import { useSession } from "@/features/auth/model/session-provider";

type Mode = "login" | "register";

export function AuthDialog() {
  const { isOpen, close } = useAuthDialog();
  const { login, register } = useSession();
  const [mode, setMode] = useState<Mode>("login");
  const [loginName, setLoginName] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, isOpen]);

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
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

    setIsSubmitting(true);

    try {
      if (mode === "login") {
        await login({ loginName: loginName.trim(), password });
        close();
      } else {
        await register({ loginName: loginName.trim(), password, nickname: nickname.trim() });
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

  if (!isOpen) return null;
  const isLogin = mode === "login";

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) close();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
        className="w-full max-w-[25rem] rounded-[1.6rem] border border-white/70 bg-white p-6 shadow-[0_28px_90px_-28px_rgba(15,23,42,0.45)] sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium tracking-[0.18em] text-sky-600">AIVISTA</p>
            <h1 id="auth-dialog-title" className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              {isLogin ? "账号登录" : "注册账号"}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              {isLogin ? "输入你的账号和密码" : "创建账号，开始你的视觉创作"}
            </p>
          </div>
          <button type="button" onClick={close} aria-label="关闭登录窗口" className="grid size-8 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X className="size-4" />
          </button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="sr-only">登录账号</span>
            <span className="relative block">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input value={loginName} onChange={(event) => setLoginName(event.target.value)} autoComplete="username" required minLength={4} maxLength={32} className="h-11 w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100" placeholder="请输入账号" />
            </span>
          </label>

          {isLogin ? null : (
            <label className="block">
              <span className="sr-only">昵称</span>
              <input value={nickname} onChange={(event) => setNickname(event.target.value)} autoComplete="nickname" required minLength={1} maxLength={32} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100" placeholder="请输入昵称" />
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

          {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p> : null}
          {notice ? <p className="rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-700">{notice}</p> : null}

          <div className="pt-1 text-right text-xs text-slate-500">
            {isLogin ? (
              <span>还没有账号？ <button type="button" onClick={() => switchMode("register")} className="font-medium text-sky-600 hover:text-sky-700">去注册</button></span>
            ) : (
              <span>已有账号？ <button type="button" onClick={() => switchMode("login")} className="font-medium text-sky-600 hover:text-sky-700">去登录</button></span>
            )}
          </div>

          <button type="submit" disabled={isSubmitting} className="h-11 w-full rounded-xl bg-slate-950 text-sm font-medium text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60">
            {isSubmitting ? "处理中…" : isLogin ? "登录" : "注册"}
          </button>
        </form>
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
        <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={isVisible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={8}
          maxLength={64}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-10 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={onToggleVisibility}
          aria-label={toggleLabel}
          className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          <VisibilityIcon className="size-4" />
        </button>
      </span>
    </label>
  );
}
