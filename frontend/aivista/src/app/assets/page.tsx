"use client";

import { AppShell } from "@/widgets/app-shell/ui/app-shell";
import { useAuthStore } from "@/features/auth/model/auth-store";
import { AssetsWorkspace } from "@/features/assets/ui/assets-workspace";

export default function AssetsPage() {
  const status = useAuthStore((state) => state.status);

  return (
    <AppShell>
      {status === "authenticated" ? (
        <AssetsWorkspace />
      ) : (
        <main className="min-h-screen" aria-busy="true" aria-label="正在加载个人资产" />
      )}
    </AppShell>
  );
}
