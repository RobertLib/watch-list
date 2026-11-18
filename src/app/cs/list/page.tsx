import type { Metadata } from "next";
import { SharedListContent } from "@/components/SharedListContent";
import { pageMetadata } from "@/lib/page-metadata";

/**
 * The Czech counterpart of `app/(en)/list/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

export const metadata: Metadata = pageMetadata({
  title: "Sdílený seznam",
  description:
    "Seznam ke zhlédnutí, který s vámi někdo sdílel. Uložte si ho jako vlastní, nebo ho porovnejte se svým.",
  noindex: true,
  locale: "cs",
});

export default function Page() {
  return <SharedListContent />;
}
