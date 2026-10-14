"use client";

import { InspirationSearchResults } from "@/widgets/inspiration-search/ui/inspiration-search-results";
import { useSearchParams } from "next/navigation";

export function InspirationSearchRoute() {
  return <InspirationSearchResults keyword={useSearchParams().get("q") ?? ""} />;
}
