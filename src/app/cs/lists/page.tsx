import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { ListPlus } from "lucide-react";
import { CollectionsManager } from "@/components/CollectionsManager";

/**
 * The Czech counterpart of `app/(en)/lists/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

export const metadata: Metadata = pageMetadata({
  title: "Vaše seznamy",
  description:
    "Kolekce, které jste si sestavili ze svého seznamu – uložené v tomto prohlížeči a sdílitelné odkazem.",
  noindex: true,
  locale: "cs",
});

export default function Page() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <ListPlus className="h-8 w-8 text-blue-400" aria-hidden="true" />
          <h1 className="text-3xl font-bold">Vaše seznamy</h1>
        </div>
        <p className="text-gray-400">
          Seznamy podle vás, uložené v tomto prohlížeči a sdílitelné odkazem.
        </p>
      </div>

      <CollectionsManager />
    </div>
  );
}
