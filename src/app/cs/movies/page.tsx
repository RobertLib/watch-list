import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { PageHero } from "@/components/PageHero";
import { MoviesContent } from "@/components/MoviesContent";
import { getMovieSectionsSnapshot } from "@/lib/build-time-tmdb";

/**
 * The Czech counterpart of `app/(en)/movies/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the headings, the editorial copy – is
 * written here in Czech.
 */

export const metadata: Metadata = pageMetadata({
  title: "Filmy – co sledovat a kde",
  description:
    "Trendy filmy, novinky v kinech, připravované premiéry i nejlépe hodnocené snímky. Filtrujte podle žánru, hodnocení, roku a služeb, které máte.",
  path: "/movies",
  locale: "cs",
});

export default async function MoviesPage() {
  const snapshot = await getMovieSectionsSnapshot("cs");

  return (
    <div className="min-h-screen bg-black">
      <PageHero
        title="Filmy"
        description="Novinky, trháky a filmy, které stojí za to vidět"
        mediaType="movie"
      />

      <div className="container mx-auto px-6 lg:px-8 py-8">
        <MoviesContent snapshot={snapshot} />

        <section
          aria-labelledby="movies-guide-heading"
          className="border-t border-gray-800 mt-16 pt-12 space-y-10"
        >
          <div>
            <h2
              id="movies-guide-heading"
              className="text-2xl font-bold text-white mb-4"
            >
              Najděte svůj další oblíbený film
            </h2>
            <p className="text-gray-400 leading-relaxed max-w-3xl">
              Od oscarových dramat po letní trháky – WatchList vám pomůže
              zorientovat se v obrovském světě filmu. Přehledy se každý den
              aktualizují o nejnovější premiéry, kasovní hity i skryté klenoty
              všech žánrů, takže vždy objevíte něco nového, ať jste příležitostný
              divák, nebo zapálený filmový fanoušek.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-8">
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">
                Filmy podle streamovací služby
              </h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Zobrazte si filmy, které najdete na Netflixu, HBO Max, Disney+,
                Prime Video, Apple TV, SkyShowtime, Oneplay a dalších
                streamovacích službách. Uvidíte přesně, co máte v rámci svých
                předplatných – bez příplatků, bez hádání a bez přeskakování mezi
                aplikacemi.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">
                Filtr podle žánru, hodnocení a roku
              </h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Ať máte chuť na akční jízdu, oddechovou romantickou komedii,
                dokument, který vás přiměje k zamyšlení, nebo horor, při kterém
                vám běhá mráz po zádech, žánrové filtry vám nabídku okamžitě
                zúží. V kombinaci s hodnocením a rokem vydání rychle najdete
                přesně to, na co máte dnes večer náladu.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">
                V kinech, připravované a nejlépe hodnocené
              </h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Sledujte, co právě běží v kinech, podívejte se na připravované
                premiéry dřív, než dorazí, nebo projděte nejlépe hodnocené filmy
                všech dob podle hodnocení diváků. WatchList načítá aktuální
                data, takže přehledy vždy odpovídají tomu, co se skutečně hraje
                a co diváci opravdu oceňují.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">
                Uložte si filmy na svůj seznam
              </h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Zaujal vás tip z recenze, trailer nebo doporučení od přátel?
                Přidejte si film na seznam jedním kliknutím. Účet nepotřebujete
                – seznam zůstává soukromě uložený ve vašem prohlížeči a čeká na
                vás, kdykoli se na stejném zařízení vrátíte.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
