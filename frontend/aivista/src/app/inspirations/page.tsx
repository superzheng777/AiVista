import { Suspense } from "react";

import { InspirationRoute } from "@/features/inspiration/ui/inspiration-route";
import { AppShell } from "@/widgets/app-shell/ui/app-shell";

export default function InspirationsPage() {
  return <AppShell><Suspense fallback={<main className="p-10 text-sm text-muted-foreground">页面加载中…</main>}><InspirationRoute /></Suspense></AppShell>;
}
