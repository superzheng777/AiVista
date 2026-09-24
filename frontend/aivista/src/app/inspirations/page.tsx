import { Suspense } from "react";

import { AppShell } from "@/widgets/app-shell/ui/app-shell";
import { InspirationRoute } from "@/widgets/inspiration-feed/ui/inspiration-route";

export default function InspirationsPage() {
  return (
    <AppShell>
      <Suspense fallback={<main className="p-10 text-sm text-muted-foreground">页面加载中…</main>}>
        <InspirationRoute />
      </Suspense>
    </AppShell>
  );
}
