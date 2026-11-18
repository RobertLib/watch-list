import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import Link from "@/i18n/Link";
import { ArrowLeft, Swords } from "lucide-react";
import { WatchlistRanking } from "@/components/WatchlistRanking";

/**
 * The Czech counterpart of `app/(en)/watchlist/ranking/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 */

export const metadata: Metadata = pageMetadata({
  title: "Seřaďte svůj seznam",
  description:
    "Nikdo nedokáže seřadit osmdesát filmů, ale vybrat ze dvou zvládne každý. Stačí pár takových voleb a seznam se seřadí sám.",
  noindex: true,
  locale: "cs",
});

export default function WatchlistRankingPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-8">
        <Link
          href="/watchlist"
          prefetch={false}
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Můj seznam
        </Link>
        <div className="flex items-center gap-3 mb-2">
          <Swords className="h-8 w-8 text-purple-400" aria-hidden="true" />
          <h1 className="text-3xl font-bold">Seřaďte svůj seznam</h1>
        </div>
        <p className="text-gray-400">
          Nikdo nedokáže seřadit osmdesát filmů. Vybrat ze dvou ale zvládne
          každý. Stačí pár takových voleb a pořadí vyjde samo.
        </p>
      </div>

      <ol className="mb-8 space-y-2.5 text-sm text-gray-400">
        <li className="flex gap-3">
          <span className="shrink-0 text-purple-400 font-mono">1</span>
          <span>
            Vybíráte ze dvou titulů z vlastního seznamu. Rychle, bez
            přemýšlení – prostě ten, který byste si pustili radši.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="shrink-0 text-purple-400 font-mono">2</span>
          <span>
            Každá odpověď posune oba tituly nahoru nebo dolů. Výhra nad
            titulem, který už máte vysoko, se počítá víc než výhra nad tím,
            který vysoko nemáte.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="shrink-0 text-purple-400 font-mono">3</span>
          <span>
            Po pár desítkách kol má váš seznam skutečné pořadí – osobní top
            desítku, kterou můžete sdílet odkazem, a jasnou první volbu na
            příště, až se nebudete moct rozhodnout.
          </span>
        </li>
      </ol>

      <WatchlistRanking />
    </div>
  );
}
