"use client";

import { useSearchParams } from "next/navigation";

import { PublicUserPage } from "./public-user-page";

export function PublicUserRoute() {
  const userId = useSearchParams().get("userId");

  if (!userId) {
    return <main className="p-10 text-sm text-destructive">缺少作者标识。</main>;
  }

  return <PublicUserPage userId={userId} />;
}
