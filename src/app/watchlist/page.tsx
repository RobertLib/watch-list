import type { Metadata } from "next";
import { WatchlistPageContent } from "@/components/WatchlistPageContent";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = pageMetadata({
  title: "My Watchlist",
  description:
    "Everything you mean to watch, sorted how you like, with where each title is streaming right now.",
  noindex: true,
});

export default function Page() {
  return <WatchlistPageContent />;
}
