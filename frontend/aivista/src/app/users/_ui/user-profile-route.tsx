"use client";

import { UserProfilePage } from "@/widgets/user-profile/ui/user-profile-page";
import { useSearchParams } from "next/navigation";

export function UserProfileRoute() {
  const userId = useSearchParams().get("userId");

  if (!userId) {
    return <main className="p-10 text-sm text-destructive">缺少作者标识。</main>;
  }

  return <UserProfilePage userId={userId} />;
}
