import type { Metadata } from "next";
import { MovieContent } from "@/components/MovieContent";
import { pageMetadata } from "@/lib/page-metadata";

/**
 * The Czech counterpart of `app/(en)/movie/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

export const metadata: Metadata = pageMetadata({
  title: "Detail filmu",
  description:
    "Obsazení, tvůrci, trailery, recenze a kde film streamovat – a jedním kliknutím na váš seznam.",
  noindex: true,
  locale: "cs",
});

export default function Page() {
  return <MovieContent />;
}
