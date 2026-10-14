"use client";

import { useAuthStore } from "@/features/auth/model/auth-store";
import { AssetLibraryWorkspace } from "@/widgets/asset-library/ui/asset-library-workspace";
import { AppShell } from "../_ui/app-shell";

export default function AssetsPage() {
  const status = useAuthStore((state) => state.status);

  return (
    <AppShell>
      {status === "authenticated" ? (
        <AssetLibraryWorkspace />
      ) : (
        <main className="min-h-screen" aria-busy="true" aria-label="正在加载个人资产" />
      )}
    </AppShell>
  );
}
