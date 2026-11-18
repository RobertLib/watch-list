import type { Metadata } from "next";
import { LegacyMoodQueryRedirect } from "@/components/LegacyQueryRedirect";
import { pageMetadata } from "@/lib/page-metadata";

/**
 * The Czech counterpart of `app/(en)/mood/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

export const metadata: Metadata = pageMetadata({
  title: "Nálada",
  description:
    "Přesměrováváme vás na náladu, kterou jste hledali.",
  noindex: true,
  locale: "cs",
});

export default function Page() {
  return <LegacyMoodQueryRedirect />;
}
