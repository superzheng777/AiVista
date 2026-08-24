"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/inspirations");
  }, [router]);

  return <main className="p-10 text-sm text-muted-foreground">正在前往灵感页…</main>;
}
