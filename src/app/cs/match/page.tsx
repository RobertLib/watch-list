import type { Metadata } from "next";
import { MatchContent } from "@/components/MatchContent";
import { pageMetadata } from "@/lib/page-metadata";

/**
 * The Czech counterpart of `app/(en)/match/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

export const metadata: Metadata = pageMetadata({
  title: "Na co se podíváme?",
  description:
    "Porovnejte dva seznamy a zjistěte, co chcete vidět oba.",
  noindex: true,
  locale: "cs",
});

export default function Page() {
  return <MatchContent />;
}
