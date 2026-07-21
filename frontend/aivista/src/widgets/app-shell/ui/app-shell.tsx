"use client";

import { FolderOpen, Home, LogIn, Palette, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

import { useAuthDialog } from "@/features/auth/model/auth-dialog-provider";
import { useSession } from "@/features/auth/model/session-provider";
import { cn } from "@/lib/utils";

type NavigationItem = { href: string; label: string; icon: typeof Home; requiresAuth?: boolean };

const navigationItems: NavigationItem[] = [
  { href: "/", label: "灵感", icon: Home },
  { href: "/generate", label: "生成", icon: Sparkles, requiresAuth: true },
  { href: "/assets", label: "资产", icon: FolderOpen, requiresAuth: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useSession();
  const { open: openAuthDialog } = useAuthDialog();

  return (
    <div className="min-h-screen bg-[#f6f7fb] text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-24 flex-col items-center border-r border-slate-200/80 bg-white py-5 md:flex">
        <Link href="/" aria-label="AiVista 首页" className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-cyan-300 via-sky-500 to-violet-500 text-white shadow-[0_10px_26px_-12px_rgba(14,165,233,0.9)]"><Palette className="size-5" strokeWidth={2.4} /></Link>
        <nav className="mt-24 flex w-full flex-col items-center gap-3">
          {navigationItems.map((item) => <SidebarLink key={item.href} item={item} active={pathname === item.href} isAuthenticated={Boolean(user)} onAuthRequired={openAuthDialog} />)}
        </nav>
        <div className="mt-auto"><AccountControl /></div>
      </aside>

      <main className="min-h-screen pb-20 md:ml-24 md:pb-0">{children}</main>
      {/*移动端访问web适配*/}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t border-slate-200 bg-white/95 px-3 backdrop-blur md:hidden">
        {navigationItems.map((item) => <SidebarLink key={item.href} item={item} active={pathname === item.href} compact isAuthenticated={Boolean(user)} onAuthRequired={openAuthDialog} />)}
        <AccountControl compact />
      </nav>
    </div>
  );
}

function SidebarLink({
  item,
  active,
  compact = false,
  isAuthenticated,
  onAuthRequired,
}: {
  item: NavigationItem;
  active: boolean;
  compact?: boolean;
  isAuthenticated: boolean;
  onAuthRequired: () => void;
}) {
  const Icon = item.icon;
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (item.requiresAuth && !isAuthenticated) {
      event.preventDefault();
      onAuthRequired();
    }
  }
  return <Link href={item.href} onClick={handleClick} className={cn("group flex items-center justify-center transition-colors", compact ? "size-11 rounded-xl" : "w-16 flex-col gap-1.5 rounded-2xl py-2.5", active ? "bg-sky-50 text-sky-600" : "text-slate-500 hover:bg-slate-100 hover:text-slate-950")}><Icon className="size-5" strokeWidth={active ? 2.5 : 2} />{compact ? null : <span className="text-xs font-medium">{item.label}</span>}</Link>;
}

function AccountControl({ compact = false }: { compact?: boolean }) {
  const { status, user } = useSession();
  const { open } = useAuthDialog();
  if (status === "loading") return <div className={cn("animate-pulse rounded-full bg-slate-100", compact ? "size-9" : "size-10")} />;
  if (!user) return <button type="button" onClick={open} className={cn("flex items-center justify-center rounded-xl bg-slate-950 font-medium text-white transition hover:bg-slate-700", compact ? "size-10" : "h-10 gap-1.5 px-3 text-xs")}><LogIn className="size-4" />{compact ? null : "登录"}</button>;

  const initial = user.nickname.trim().slice(0, 1).toUpperCase() || "我";
  return <Link href="/profile" aria-label="进入个人主页" className="group relative block"><span className="grid size-10 overflow-hidden rounded-full bg-sky-100 text-sky-700 ring-2 ring-transparent transition group-hover:ring-sky-300">{user.avatarUrl ? (
    // Avatar URLs will be served by the media domain in a later iteration.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={user.avatarUrl} alt={`${user.nickname}的头像`} className="size-full object-cover" />
  ) : <span className="grid place-items-center text-sm font-semibold">{initial}</span>}</span></Link>;
}
