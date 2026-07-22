"use client";

import { FolderOpen, Home, Palette, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type MouseEvent, type ReactNode, useEffect } from "react";

import { AccountControl } from "@/features/account-menu/ui/account-control";
import { useAuthDialog } from "@/features/auth/model/auth-dialog-provider";
import type { AuthStatus } from "@/features/auth/model/auth-store";
import { useSession } from "@/features/auth/model/session-provider";
import { cn } from "@/lib/utils";

type NavigationItem = { href: string; label: string; icon: typeof Home; requiresAuth?: boolean };

const navigationItems: NavigationItem[] = [
  { href: "/", label: "灵感", icon: Home },
  { href: "/generate", label: "生成", icon: Sparkles, requiresAuth: true },
  { href: "/assets", label: "资产", icon: FolderOpen, requiresAuth: true },
];

function isProtectedPath(pathname: string): boolean {
  return pathname === "/profile" || pathname === "/assets" || pathname.startsWith("/generate");
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useSession();
  const { open: openAuthDialog } = useAuthDialog();

  useEffect(() => {
    if (status === "anonymous" && isProtectedPath(pathname)) {
      router.replace("/");
    }
  }, [pathname, router, status]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-24 flex-col items-center border-r border-sidebar-border bg-sidebar py-5 md:flex">
        <Link href="/" aria-label="AiVista 首页" className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-cyan-300 via-sky-500 to-violet-500 text-white shadow-[0_10px_26px_-12px_rgba(14,165,233,0.9)]"><Palette className="size-5" strokeWidth={2.4} /></Link>
        <nav className="mt-24 flex w-full flex-col items-center gap-3">
          {navigationItems.map((item) => <SidebarLink key={item.href} item={item} active={pathname === item.href} authStatus={status} onAuthRequired={openAuthDialog} />)}
        </nav>
        <div className="mt-auto"><AccountControl /></div>
      </aside>

      <main className="min-h-screen pb-20 md:ml-24 md:pb-0">{children}</main>
      {/*移动端访问web适配*/}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t border-sidebar-border bg-sidebar/95 px-3 backdrop-blur md:hidden">
        {navigationItems.map((item) => <SidebarLink key={item.href} item={item} active={pathname === item.href} compact authStatus={status} onAuthRequired={openAuthDialog} />)}
        <AccountControl compact />
      </nav>
    </div>
  );
}

function SidebarLink({
  item,
  active,
  compact = false,
  authStatus,
  onAuthRequired,
}: {
  item: NavigationItem;
  active: boolean;
  compact?: boolean;
  authStatus: AuthStatus;
  onAuthRequired: () => void;
}) {
  const Icon = item.icon;
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (item.requiresAuth && authStatus !== "authenticated") {
      event.preventDefault();
      if (authStatus === "anonymous") {
        onAuthRequired();
      }
    }
  }
  return <Link href={item.href} onClick={handleClick} className={cn("group flex items-center justify-center transition-colors", compact ? "size-11 rounded-xl" : "w-16 flex-col gap-1.5 rounded-2xl py-2.5", active ? "bg-sky-50 text-sky-600 dark:bg-sky-950/70 dark:text-sky-300" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="size-5" strokeWidth={active ? 2.5 : 2} />{compact ? null : <span className="text-xs font-medium">{item.label}</span>}</Link>;
}
