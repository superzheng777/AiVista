import { Suspense } from "react";

import { PublicUserRoute } from "@/features/public-user/ui/public-user-route";
import { AppShell } from "@/widgets/app-shell/ui/app-shell";

export default function UsersPage() {
  return <AppShell><Suspense fallback={<main className="p-10 text-sm text-muted-foreground">作者主页加载中…</main>}><PublicUserRoute /></Suspense></AppShell>;
}
