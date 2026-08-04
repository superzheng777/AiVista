"use client";

import { AppShell } from "@/widgets/app-shell/ui/app-shell";
import { useSession } from "@/features/auth/model/session-provider";
import { AssetsWorkspace } from "@/features/assets/ui/assets-workspace";

export default function AssetsPage() {
  const { status } = useSession();

  return (
    <AppShell>
      {status === "authenticated" ? <AssetsWorkspace /> : <main className="min-h-screen" aria-busy="true" aria-label="正在加载个人资产" />}
    </AppShell>
  );
}
