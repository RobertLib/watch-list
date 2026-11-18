import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { PageHero } from "@/components/PageHero";
import { GenresContent } from "@/components/GenresContent";
import { StructuredData } from "@/components/StructuredData";
import { absoluteLocalizedUrl } from "@/lib/routes";

/**
 * The Czech counterpart of `app/(en)/genres/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the headings, the editorial copy – is
 * written here in Czech.
 */

export const metadata: Metadata = pageMetadata({
  title: "Žánry filmů a seriálů",
  description:
    "Všechny filmové a seriálové žánry na jednom místě – od akčních po dokumentární. Vyberte si žánr a zjistěte, co stojí za to vidět na vašich službách.",
  path: "/genres",
  locale: "cs",
});

export default function GenresPage() {
  return (
    <div className="min-h-screen bg-black">
      <StructuredData
        type="BreadcrumbList"
        locale="cs"
        data={{
          breadcrumbItems: [
            { name: "Domů", url: absoluteLocalizedUrl("/", "cs") },
            { name: "Žánry", url: absoluteLocalizedUrl("/genres", "cs") },
          ],
        }}
      />

      <PageHero
        title="Žánry"
        description="Procházejte filmy a seriály podle žánru"
        mediaType="all"
      />

      <div className="container mx-auto px-6 lg:px-8 py-8">
        <GenresContent locale="cs" />

        <section
          aria-labelledby="genres-guide-heading"
          className="border-t border-gray-800 mt-16 pt-12 space-y-10"
        >
          <div>
            <h2
              id="genres-guide-heading"
              className="text-2xl font-bold text-white mb-4"
            >
              Filmy a seriály podle žánru
            </h2>
            <p className="text-gray-400 leading-relaxed max-w-3xl">
              Procházení podle žánru je jeden z nejrychlejších způsobů, jak
              najít, co sledovat. Ať máte chuť na adrenalin akčního thrilleru,
              smích u komedie, napětí krimi dramatu, nebo úžas z velkolepého
              sci-fi, WatchList vás pustí rovnou do kategorie, která odpovídá
              vaší náladě – bez probírání titulů, které vás nezajímají.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            <div className="space-y-2">
              <h3 className="font-semibold text-white">
                Akční a dobrodružné
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Divoké honičky, epické bitvy a hrdinové, kteří procestují celý
                svět. Prozkoumejte nejlepší akční a dobrodružné filmy a seriály
                – od velkých hollywoodských ság po menší thrillery, které vám
                možná unikly.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-white">Drama a krimi</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Složité postavy, morální dilemata a strhující příběhy.
                Procházejte nejlépe hodnocená dramata a krimi seriály, od
                kterých se neodtrhnete od první scény do poslední.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-white">Komedie a romantika</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Někdy se prostě potřebujete pořádně zasmát nebo si užít
                příběh o lásce, který zahřeje u srdce. Najděte nejlépe hodnocené
                komedie a romantické filmy na rande, na večer o samotě i na
                filmový večer s přáteli.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-white">Sci-fi a fantasy</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Paralelní vesmíry, technologie budoucnosti a bájné světy.
                Objevte nejnápaditější sci-fi filmy a fantasy seriály – od
                vesmírných oper po velkolepé fantasy ságy.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-white">
                Horory a thrillery
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Lekačky, psychologický teror a napětí, při kterém zapomenete
                dýchat. Procházejte nejděsivější horory a nejnapínavější
                thrillery, které jsou právě teď k dispozici na vašich
                streamovacích službách.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-white">
                Dokumenty a reality show
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Skutečné příběhy, které předčí každou fikci. Prozkoumejte
                oceňované dokumentární filmy a poutavé reality show o všem
                možném – od přírody a historie po true crime a kulturu.
              </p>
            </div>
          </div>

          <p className="text-gray-400 leading-relaxed text-sm max-w-3xl">
            Každou stránku žánru si můžete vyfiltrovat podle streamovací služby
            a země, takže uvidíte jen tituly, které můžete sledovat hned teď.
            Cokoli vás zaujme, si přidáte na svůj seznam – bez účtu.
          </p>
        </section>
      </div>
    </div>
  );
}
