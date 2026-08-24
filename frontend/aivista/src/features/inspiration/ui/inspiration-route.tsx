"use client";

import { useSearchParams } from "next/navigation";

import { InspirationHome, type InspirationFeedView } from "@/components/app/inspiration-home";

import { DirectPublicInspirationDetail } from "./direct-public-inspiration-detail";

export function InspirationRoute() {
  const searchParams = useSearchParams();
  const imageId = searchParams.get("imageId");
  const view: InspirationFeedView = searchParams.get("view") === "following" ? "following" : "discovery";

  if (imageId) {
    return <DirectPublicInspirationDetail imageId={imageId} />;
  }

  return <InspirationHome view={view} />;
}
