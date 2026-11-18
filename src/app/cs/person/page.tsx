import type { Metadata } from "next";
import { PersonContent } from "@/components/PersonContent";
import { pageMetadata } from "@/lib/page-metadata";

/**
 * The Czech counterpart of `app/(en)/person/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

export const metadata: Metadata = pageMetadata({
  title: "Osobnost",
  description:
    "Filmografie, životopis a nejznámější díla herce, režiséra nebo scenáristy.",
  noindex: true,
  locale: "cs",
});

export default function Page() {
  return <PersonContent />;
}
