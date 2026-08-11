"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useSession } from "@/features/auth/model/session-provider";

/** Legacy entry point. The profile itself always lives at /users/[userId]. */
export default function ProfilePage() {
  const router = useRouter();
  const { status, user } = useSession();

  useEffect(() => {
    if (status === "authenticated" && user) router.replace(`/users/${user.id}`);
    if (status === "anonymous") router.replace("/");
  }, [router, status, user]);

  return <main className="min-h-screen" aria-busy="true" aria-label="正在前往个人主页" />;
}
