"use client";

import { AppShell } from "@/widgets/app-shell/ui/app-shell";
import { useSession } from "@/features/auth/model/session-provider";
import { GenerateWorkspace } from "@/features/generation/ui/generate-workspace";

export default function GeneratePage() {
  const { status } = useSession();

  return (
    <AppShell>
      {status === "authenticated" ? <GenerateWorkspace /> : <main className="min-h-screen" aria-busy="true" aria-label="正在加载生成工作台" />}
    </AppShell>
  );
}
