import type { Metadata } from "next";
import { LegacyGenreQueryRedirect } from "@/components/LegacyQueryRedirect";
import { pageMetadata } from "@/lib/page-metadata";

/**
 * The Czech counterpart of `app/(en)/genres/tv/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

export const metadata: Metadata = pageMetadata({
  title: "Seriály podle žánru",
  description:
    "Přesměrováváme vás na žánr, který jste hledali.",
  noindex: true,
  locale: "cs",
});

export default function Page() {
  return <LegacyGenreQueryRedirect mediaType="tv" />;
}
