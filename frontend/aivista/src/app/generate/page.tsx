"use client";

import { useAuthStore } from "@/features/auth/model/auth-store";
import { GenerationWorkspace } from "@/widgets/generation-workspace/ui/generation-workspace";
import { AppShell } from "../_ui/app-shell";

export default function GeneratePage() {
  const status = useAuthStore((state) => state.status);

  return (
    <AppShell>
      {status === "authenticated" ? (
        <GenerationWorkspace />
      ) : (
        <main className="min-h-screen" aria-busy="true" aria-label="正在加载生成工作台" />
      )}
    </AppShell>
  );
}
