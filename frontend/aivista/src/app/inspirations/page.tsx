import { InspirationHome, type InspirationFeedView } from "@/components/app/inspiration-home";
import { AppShell } from "@/widgets/app-shell/ui/app-shell";

export default async function InspirationsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const selectedView: InspirationFeedView = view === "following" ? "following" : "discovery";
  return <AppShell><InspirationHome view={selectedView} /></AppShell>;
}
