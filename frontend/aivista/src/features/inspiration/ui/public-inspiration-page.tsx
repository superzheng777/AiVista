"use client";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import { InspirationHome } from "@/components/app/inspiration-home";
import { PublicInspirationModal } from "@/features/inspiration/ui/public-inspiration-modal";

export function PublicInspirationPage({ image }: { image: GenerationAsset }) {
  return <><InspirationHome /><PublicInspirationModal image={image} closeTo="/" /></>;
}
