import type { Metadata } from "next";
import { SearchContent } from "@/components/SearchContent";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = pageMetadata({
  title: "Search",
  description: "Search every film, series and person TMDB knows about.",
  noindex: true,
});

export default function Page() {
  return <SearchContent />;
}
