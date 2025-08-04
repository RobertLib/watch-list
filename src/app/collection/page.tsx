import type { Metadata } from "next";
import { CollectionContent } from "@/components/CollectionContent";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = pageMetadata({
  title: "Collection",
  description:
    "Every film in a series, in order, with what you have already seen marked off.",
  noindex: true,
});

/** A film series – "the Alien collection" – named by `?id=` like every title. */
export default function Page() {
  return <CollectionContent />;
}
