import { notFound } from "next/navigation";

import { getPublicInspiration } from "@/features/inspiration/api/server-inspiration-api";
import { PublicInspirationModal } from "@/features/inspiration/ui/public-inspiration-modal";

export default async function InterceptedInspirationPage({ params }: { params: Promise<{ imageId: string }> }) {
  const { imageId } = await params;
  const image = await getPublicInspiration(imageId);
  if (!image) notFound();
  return <PublicInspirationModal image={image} />;
}
