"use client";

import { useParams } from "next/navigation";
import { PublicUserPage } from "@/features/public-user/ui/public-user-page";
import { AppShell } from "@/widgets/app-shell/ui/app-shell";

export default function UserPage() { const params = useParams<{ userId: string }>(); return <AppShell><PublicUserPage userId={params.userId} /></AppShell>; }
