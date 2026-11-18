import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import Link from "@/i18n/Link";
import { ArrowLeft } from "lucide-react";
import { DailyArchiveGrid } from "@/components/DailyArchiveGrid";
import { StructuredData } from "@/components/StructuredData";
import { absoluteLocalizedUrl } from "@/lib/routes";

/**
 * The Czech counterpart of `app/(en)/daily/archive/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

export const metadata: Metadata = pageMetadata({
  title: "Archiv denních hádanek",
  description:
    "Všechny starší denní filmové hádanky, které si můžete kdykoli zahrát. Doženete dny, které jste vynechali, a uvidíte, jak si vede vaše série.",
  path: "/daily/archive",
  locale: "cs",
});

export default function DailyArchivePage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <StructuredData
        type="BreadcrumbList"
        locale="cs"
        data={{
          breadcrumbItems: [
            { name: "Domů", url: absoluteLocalizedUrl("/", "cs") },
            { name: "Denní hádanka", url: absoluteLocalizedUrl("/daily", "cs") },
            { name: "Archiv", url: absoluteLocalizedUrl("/daily/archive", "cs") },
          ],
        }}
      />

      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <Link
            href="/daily"
            prefetch={false}
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Dnešní hádanka
          </Link>
          <h1 className="text-3xl font-bold mb-2">Archiv hádanek</h1>
          <p className="text-gray-400">
            Všechny hádanky, které už proběhly. Které jste hráli, si pamatuje
            tento prohlížeč – stejně jako všechno ostatní tady.
          </p>
        </div>

        <DailyArchiveGrid />
      </div>
    </div>
  );
}
