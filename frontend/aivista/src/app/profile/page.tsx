"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuthStore } from "@/features/auth/model/auth-store";

/** Legacy entry point. The profile itself always lives at /users?userId={userId}. */
export default function ProfilePage() {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (status === "authenticated" && user) router.replace(`/users?userId=${encodeURIComponent(user.id)}`);
    if (status === "anonymous") router.replace("/");
  }, [router, status, user]);

  return <main className="min-h-screen" aria-busy="true" aria-label="正在前往个人主页" />;
}
