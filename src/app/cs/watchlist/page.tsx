import type { Metadata } from "next";
import { WatchlistPageContent } from "@/components/WatchlistPageContent";
import { pageMetadata } from "@/lib/page-metadata";

/**
 * The Czech counterpart of `app/(en)/watchlist/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

export const metadata: Metadata = pageMetadata({
  title: "Můj seznam",
  description:
    "Vše, co chcete vidět, seřazené podle vás – a kde se který titul právě streamuje.",
  noindex: true,
  locale: "cs",
});

export default function Page() {
  return <WatchlistPageContent />;
}
