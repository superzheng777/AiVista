"use client";

import { AppShell } from "@/widgets/app-shell/ui/app-shell";
import { AssetsPlaceholder } from "@/components/app/feature-placeholder";
import { useSession } from "@/features/auth/model/session-provider";
import { useAuthDialog } from "@/features/auth/model/auth-dialog-provider";

export default function AssetsPage() {
  const { user } = useSession();
  const { open: openAuthDialog } = useAuthDialog();

  return (
    <AppShell>
      <AssetsPlaceholder isLoggedIn={Boolean(user)} onLoginRequest={openAuthDialog} />
    </AppShell>
  );
}
