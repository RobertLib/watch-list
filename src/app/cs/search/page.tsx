import type { Metadata } from "next";
import { SearchContent } from "@/components/SearchContent";
import { pageMetadata } from "@/lib/page-metadata";

/**
 * The Czech counterpart of `app/(en)/search/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

export const metadata: Metadata = pageMetadata({
  title: "Hledat",
  description:
    "Prohledejte všechny filmy, seriály a osobnosti, které TMDB zná.",
  noindex: true,
  locale: "cs",
});

export default function Page() {
  return <SearchContent />;
}
