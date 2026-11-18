import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { BarChart3 } from "lucide-react";
import { WatchStatsContent } from "@/components/WatchStatsContent";

/**
 * The Czech counterpart of `app/(en)/stats/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

export const metadata: Metadata = pageMetadata({
  title: "Vaše statistiky",
  description:
    "Zhlédnuté hodiny, oblíbené žánry, desetiletí, ve kterých se pohybujete, a jak jsou rozložená vaše hodnocení.",
  noindex: true,
  locale: "cs",
});

export default function Page() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <BarChart3 className="h-8 w-8 text-blue-400" aria-hidden="true" />
          <h1 className="text-3xl font-bold">Vaše statistiky</h1>
        </div>
        <p className="text-gray-400">
          Spočítáno z toho, co má uloženo tento prohlížeč. Nic z toho se nikam neodesílá.
        </p>
      </div>

      <WatchStatsContent />
    </div>
  );
}
