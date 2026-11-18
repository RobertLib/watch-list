import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { PageHero } from "@/components/PageHero";
import { TVShowsContent } from "@/components/TVShowsContent";
import { getTVSectionsSnapshot } from "@/lib/build-time-tmdb";

/**
 * The Czech counterpart of `app/(en)/tv-shows/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the headings, the editorial copy – is
 * written here in Czech.
 */

export const metadata: Metadata = pageMetadata({
  title: "Seriály – co sledovat a kde",
  description:
    "Populární, právě vysílané i nejlépe hodnocené seriály. Filtrujte podle žánru, hodnocení a streamovacích služeb, které už máte předplacené.",
  path: "/tv-shows",
  locale: "cs",
});

export default async function TVShowsPage() {
  const snapshot = await getTVSectionsSnapshot("cs");

  return (
    <div className="min-h-screen bg-black">
      <PageHero
        title="Seriály"
        description="Novinky, hity a seriály, které stojí za to vidět"
        mediaType="tv"
      />

      <div className="container mx-auto px-6 lg:px-8 py-8">
        <TVShowsContent snapshot={snapshot} />

        <section
          aria-labelledby="tv-guide-heading"
          className="border-t border-gray-800 mt-16 pt-12 space-y-10"
        >
          <div>
            <h2
              id="tv-guide-heading"
              className="text-2xl font-bold text-white mb-4"
            >
              Najděte další seriál, od kterého se neodtrhnete
            </h2>
            <p className="text-gray-400 leading-relaxed max-w-3xl">
              Od prestižních dramatických seriálů po návykové reality show –
              WatchList vám pomůže snadno najít, na co se dívat dál. Najdete tu
              tisíce seriálů všech žánrů ze všech služeb a každý den přibývají
              nové premiéry, pokračování dalších řad i aktuální trendy, takže
              vám nikdy nedojde, co sledovat.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-8">
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">
                Seriály podle streamovací služby
              </h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Zobrazte si seriály, které najdete na Netflixu, HBO Max,
                Disney+, Prime Video, Apple TV, SkyShowtime, Oneplay a mnoha
                dalších službách. Najdete celé seriály, které máte v rámci svých
                předplatných, a můžete se do nich pustit hned – bez dalších
                výdajů.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">
                Filtr podle žánru a hodnocení
              </h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Tisíce seriálů zúžíte podle žánru – drama, komedie, krimi,
                sci-fi, fantasy, dokument, reality show a další. V kombinaci s
                hodnocením diváků uvidíte jen seriály, které opravdu stojí za
                váš čas.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">
                Právě vysílané a nejlépe hodnocené seriály
              </h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Objevte seriály, ke kterým právě vycházejí nové epizody,
                pohlídejte si návrat oblíbených seriálů s novou řadou, nebo se
                pusťte do nejlépe hodnocených seriálů všech dob, které si
                oblíbili diváci po celém světě. Budete mít přehled o tom, co
                dnes vychází, aniž byste museli procházet nekonečné nabídky
                streamovacích služeb.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">
                Podrobnosti o seriálu a přehled epizod
              </h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Stránka každého seriálu nabízí obsazení a štáb, počet epizod,
                informace o jednotlivých řadách, recenze diváků, trailery a
                dostupnost na streamovacích službách – všechno, co potřebujete k
                rozhodnutí, jestli se do nového seriálu pustit. Na seznam si ho
                přidáte jedním kliknutím.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
