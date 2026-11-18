import type { Metadata } from "next";
import { CollectionContent } from "@/components/CollectionContent";
import { pageMetadata } from "@/lib/page-metadata";

/**
 * The Czech counterpart of `app/(en)/collection/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

export const metadata: Metadata = pageMetadata({
  title: "Kolekce",
  description:
    "Všechny filmy jedné série v pořadí, s vyznačením těch, které už jste viděli.",
  noindex: true,
  locale: "cs",
});

export default function Page() {
  return <CollectionContent />;
}
