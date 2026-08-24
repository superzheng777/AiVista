"use client";

import { useSearchParams } from "next/navigation";

import { InspirationSearchResults } from "./inspiration-search-results";

export function InspirationSearchRoute() {
  return <InspirationSearchResults keyword={useSearchParams().get("q") ?? ""} />;
}
