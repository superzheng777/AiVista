import { Suspense } from "react";

import { InspirationSearchRoute } from "@/features/inspiration/ui/inspiration-search-route";
import { AppShell } from "@/widgets/app-shell/ui/app-shell";

export default function InspirationSearchPage() {
  return <AppShell><Suspense fallback={<main className="p-10 text-sm text-muted-foreground">搜索页面加载中…</main>}><InspirationSearchRoute /></Suspense></AppShell>;
}
