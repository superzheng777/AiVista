"use client";

import { AppShell } from "@/widgets/app-shell/ui/app-shell";
import { useAuthStore } from "@/features/auth/model/auth-store";
import { GenerateWorkspace } from "@/features/generation/ui/generate-workspace";

export default function GeneratePage() {
  const status = useAuthStore((state) => state.status);

  return (
    <AppShell>
      {status === "authenticated" ? (
        <GenerateWorkspace />
      ) : (
        <main className="min-h-screen" aria-busy="true" aria-label="正在加载生成工作台" />
      )}
    </AppShell>
  );
}
