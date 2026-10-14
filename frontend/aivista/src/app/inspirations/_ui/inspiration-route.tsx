"use client";

import { InspirationFeed, type InspirationFeedView } from "@/widgets/inspiration-feed/ui/inspiration-feed";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { DirectPublicInspirationDetail } from "./direct-public-inspiration-detail";

export function InspirationRoute() {
  const searchParams = useSearchParams();
  const imageId = searchParams.get("imageId");
  const view: InspirationFeedView = searchParams.get("view") === "following" ? "following" : "discovery";
  const [directEntry, setDirectEntry] = useState(() => imageId !== null);

  if (directEntry && imageId) {
    return <DirectPublicInspirationDetail imageId={imageId} onExit={() => setDirectEntry(false)} />;
  }

  return <InspirationFeed view={view} />;
}
