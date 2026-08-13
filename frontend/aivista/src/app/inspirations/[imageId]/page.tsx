import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppShell } from "@/widgets/app-shell/ui/app-shell";
import { getPublicInspiration } from "@/features/inspiration/api/server-inspiration-api";
import { PublicInspirationPage } from "@/features/inspiration/ui/public-inspiration-page";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ imageId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { imageId } = await params;
  const image = await getPublicInspiration(imageId);
  if (!image) return { title: "作品不存在 | AiVista" };
  return {
    title: `${image.title ?? "公开作品"} | AiVista`,
    description: image.description ?? "AiVista 公开作品",
  };
}

export default async function InspirationDetailPage({ params }: PageProps) {
  const { imageId } = await params;
  const image = await getPublicInspiration(imageId);
  if (!image) notFound();
  return <AppShell><PublicInspirationPage image={image} /></AppShell>;
}
