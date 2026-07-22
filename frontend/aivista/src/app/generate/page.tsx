"use client";

import { AppShell } from "@/widgets/app-shell/ui/app-shell";
import { GeneratePlaceholder } from "@/components/app/feature-placeholder";
import { useSession } from "@/features/auth/model/session-provider";

export default function GeneratePage() {
  const { status } = useSession();

  return (
    <AppShell>
      {status === "authenticated" ? <GeneratePlaceholder /> : <main className="min-h-screen" aria-busy="true" aria-label="正在加载生成工作台" />}
    </AppShell>
  );
}
