import { Suspense } from "react";
import { AppShell } from "../_ui/app-shell";
import { UserProfileRoute } from "./_ui/user-profile-route";

export default function UsersPage() {
  return (
    <AppShell>
      <Suspense fallback={<main className="p-10 text-sm text-muted-foreground">作者主页加载中…</main>}>
        <UserProfileRoute />
      </Suspense>
    </AppShell>
  );
}
