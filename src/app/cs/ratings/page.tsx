import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { Star } from "lucide-react";
import { RatedTitles } from "@/components/RatedTitles";

/**
 * The Czech counterpart of `app/(en)/ratings/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

export const metadata: Metadata = pageMetadata({
  title: "Moje hodnocení",
  description:
    "Všechny tituly, které jste ohodnotili na stupnici do deseti, s histogramem toho, jak doopravdy hodnotíte.",
  noindex: true,
  locale: "cs",
});

export default function Page() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Star className="h-8 w-8 text-yellow-400" aria-hidden="true" />
          <h1 className="text-3xl font-bold">Všechno, co jste ohodnotili</h1>
        </div>
        <p className="text-gray-400">
          Vaše hodnocení na jednom místě – ať už titul na seznamu ještě máte, nebo je označený jako zhlédnutý.
        </p>
      </div>

      <RatedTitles />
    </div>
  );
}
