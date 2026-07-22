"use client";

import { AppShell } from "@/widgets/app-shell/ui/app-shell";
import { AssetsPlaceholder } from "@/components/app/feature-placeholder";
import { useSession } from "@/features/auth/model/session-provider";

export default function AssetsPage() {
  const { status } = useSession();

  return (
    <AppShell>
      {status === "authenticated" ? <AssetsPlaceholder /> : <main className="min-h-screen" aria-busy="true" aria-label="正在加载个人资产" />}
    </AppShell>
  );
}
