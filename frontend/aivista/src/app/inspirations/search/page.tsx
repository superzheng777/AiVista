import { InspirationSearchResults } from "@/features/inspiration/ui/inspiration-search-results";
import { AppShell } from "@/widgets/app-shell/ui/app-shell";

export default async function InspirationSearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  return <AppShell><InspirationSearchResults keyword={q} /></AppShell>;
}
