"use client";

import { useRouter } from "next/navigation";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import { PublicImageDetail } from "@/features/inspiration/ui/public-image-detail";

export function PublicInspirationModal({ image, closeTo }: { image: GenerationAsset; closeTo?: string }) {
  const router = useRouter();
  return <div className="fixed inset-0 z-50"><PublicImageDetail image={image} onClose={() => closeTo ? router.push(closeTo) : router.back()} /></div>;
}
