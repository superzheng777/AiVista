import { Suspense } from "react";
import { AppShell } from "../../_ui/app-shell";
import { InspirationSearchRoute } from "./_ui/inspiration-search-route";

export default function InspirationSearchPage() {
  return (
    <AppShell>
      <Suspense fallback={<main className="p-10 text-sm text-muted-foreground">搜索页面加载中…</main>}>
        <InspirationSearchRoute />
      </Suspense>
    </AppShell>
  );
}
