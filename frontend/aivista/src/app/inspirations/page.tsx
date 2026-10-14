import { Suspense } from "react";
import { AppShell } from "../_ui/app-shell";
import { InspirationRoute } from "./_ui/inspiration-route";

export default function InspirationsPage() {
  return (
    <AppShell>
      <Suspense fallback={<main className="p-10 text-sm text-muted-foreground">页面加载中…</main>}>
        <InspirationRoute />
      </Suspense>
    </AppShell>
  );
}
