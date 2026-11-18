import type { Metadata } from "next";
import { PeoplePageContent } from "@/components/PeoplePageContent";
import { pageMetadata } from "@/lib/page-metadata";
import { getPeopleSnapshot } from "@/lib/build-time-tmdb";

/**
 * The Czech counterpart of `app/(en)/people/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

export const metadata: Metadata = pageMetadata({
  title: "Osobnosti",
  description:
    "Nejpopulárnější herci, režiséři a tvůrci filmů a seriálů tohoto týdne a čím jsou známí.",
  path: "/people",
  locale: "cs",
});

export default async function Page() {
  return <PeoplePageContent snapshot={await getPeopleSnapshot("cs")} />;
}
