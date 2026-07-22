"use client";

import { Check, ChevronRight, LogIn, LogOut, Monitor, Moon, RotateCw, Smartphone, Sun, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { LogoutConfirmDialog } from "@/features/auth/ui/logout-confirm-dialog";
import { useAuthDialog } from "@/features/auth/model/auth-dialog-provider";
import { useSession } from "@/features/auth/model/session-provider";
import { type ThemePreference, useTheme } from "@/features/theme/model/theme-provider";
import { cn } from "@/lib/utils";

type AccountControlProps = { compact?: boolean };
type Submenu = "theme" | "app" | null;

const themeOptions: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: "light", label: "浅色模式", icon: Sun },
  { value: "dark", label: "深色模式", icon: Moon },
  { value: "system", label: "跟随系统颜色", icon: Monitor },
];

const themeLabels: Record<ThemePreference, string> = {
  light: "浅色模式",
  dark: "深色模式",
  system: "跟随系统颜色",
};

export function AccountControl({ compact = false }: AccountControlProps) {
  const router = useRouter();
  const { status, user, restoreSession, logout } = useSession();
  const { open: openAuthDialog } = useAuthDialog();
  const { preference, setPreference } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [submenu, setSubmenu] = useState<Submenu>(null);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const closeMenu = useCallback(() => {
    clearCloseTimer();
    setIsMenuOpen(false);
    setSubmenu(null);
  }, [clearCloseTimer]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(closeMenu, 120);
  }, [clearCloseTimer, closeMenu]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen, closeMenu]);

  async function handleLogout() {
    await logout();
    router.replace("/");
  }

  if (status === "loading") return <div className={cn("animate-pulse rounded-full bg-muted", compact ? "size-9" : "size-10")} />;
  if (status === "error") return <button type="button" onClick={() => void restoreSession()} aria-label="重新连接" className={cn("flex items-center justify-center rounded-xl border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground", compact ? "size-10" : "h-10 gap-1.5 px-3 text-xs")}><RotateCw className="size-4" />{compact ? null : "重试"}</button>;
  if (!user) return <button type="button" onClick={openAuthDialog} className={cn("flex items-center justify-center rounded-xl bg-primary font-medium text-primary-foreground transition hover:bg-primary/80", compact ? "size-10" : "h-10 gap-1.5 px-3 text-xs")}><LogIn className="size-4" />{compact ? null : "登录"}</button>;

  const initial = user.nickname.trim().slice(0, 1).toUpperCase() || "我";
  if (compact) {
    return <Link href="/profile" aria-label="进入个人主页" className="grid size-10 overflow-hidden rounded-full bg-sky-100 text-sky-700 ring-2 ring-transparent transition hover:ring-sky-300 dark:bg-sky-950 dark:text-sky-200">{user.avatarUrl ? <AvatarImage avatarUrl={user.avatarUrl} nickname={user.nickname} /> : <span className="grid place-items-center text-sm font-semibold">{initial}</span>}</Link>;
  }

  return (
    <div ref={containerRef} className="relative flex w-full justify-center" onMouseEnter={clearCloseTimer} onMouseLeave={scheduleClose} onFocusCapture={() => setIsMenuOpen(true)} onBlurCapture={() => setTimeout(() => { if (!containerRef.current?.contains(document.activeElement)) closeMenu(); }, 0)}>
      <Link href="/profile" aria-label="进入个人主页" onMouseEnter={() => setIsMenuOpen(true)} className="grid size-10 overflow-hidden rounded-full bg-sky-100 text-sky-700 ring-2 ring-transparent transition hover:ring-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:bg-sky-950 dark:text-sky-200">{user.avatarUrl ? <AvatarImage avatarUrl={user.avatarUrl} nickname={user.nickname} /> : <span className="grid place-items-center text-sm font-semibold">{initial}</span>}</Link>

      {isMenuOpen ? (
        <div className="absolute bottom-0 left-[calc(100%+0.75rem)] z-40 w-52 rounded-2xl border border-border bg-popover p-1.5 shadow-[0_18px_45px_-22px_rgba(15,23,42,0.5)]">
          <Link href="/profile" onClick={closeMenu} className="flex h-10 items-center gap-3 rounded-xl px-3 text-sm text-popover-foreground transition hover:bg-muted"><UserRound className="size-4" />个人主页</Link>
          <div className="relative" onMouseEnter={() => setSubmenu("theme")}>
            <button type="button" className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-popover-foreground transition hover:bg-muted"><Sun className="size-4" /><span className="flex-1">{themeLabels[preference]}</span><ChevronRight className="size-4 text-muted-foreground" /></button>
            {submenu === "theme" ? <ThemeSubmenu preference={preference} onSelect={(nextPreference) => { setPreference(nextPreference); closeMenu(); }} /> : null}
          </div>
          <div className="relative" onMouseEnter={() => setSubmenu("app")}>
            <button type="button" className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-popover-foreground transition hover:bg-muted"><Smartphone className="size-4" /><span className="flex-1">AiVista APP</span><ChevronRight className="size-4 text-muted-foreground" /></button>
            {submenu === "app" ? <div className="absolute left-[calc(100%+0.5rem)] top-0 z-50 w-32 rounded-2xl border border-border bg-popover p-1.5 shadow-[0_18px_45px_-22px_rgba(15,23,42,0.5)]"><p className="rounded-xl px-3 py-2.5 text-sm text-muted-foreground">敬请期待</p></div> : null}
          </div>
          <div className="my-1 border-t border-border" />
          <button type="button" onClick={() => { closeMenu(); setIsLogoutDialogOpen(true); }} className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-popover-foreground transition hover:bg-muted"><LogOut className="size-4" />退出登录</button>
        </div>
      ) : null}

      <LogoutConfirmDialog isOpen={isLogoutDialogOpen} onClose={() => setIsLogoutDialogOpen(false)} onConfirm={handleLogout} />
    </div>
  );
}

function ThemeSubmenu({ preference, onSelect }: { preference: ThemePreference; onSelect: (preference: ThemePreference) => void }) {
  return (
    <div className="absolute left-[calc(100%+0.5rem)] top-0 z-50 w-44 rounded-2xl border border-border bg-popover p-1.5 shadow-[0_18px_45px_-22px_rgba(15,23,42,0.5)]">
      {themeOptions.map(({ value, label, icon: Icon }) => (
        <button key={value} type="button" onClick={() => onSelect(value)} className={cn("flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition", preference === value ? "bg-sky-50 text-sky-700 dark:bg-sky-950/70 dark:text-sky-200" : "text-popover-foreground hover:bg-muted")}><Icon className="size-4" /><span className="flex-1">{label}</span>{preference === value ? <Check className="size-4" /> : null}</button>
      ))}
    </div>
  );
}

function AvatarImage({ avatarUrl, nickname }: { avatarUrl: string; nickname: string }) {
  // Avatar URLs will be served by the media domain in a later iteration.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={avatarUrl} alt={`${nickname}的头像`} className="size-full object-cover" />;
}
