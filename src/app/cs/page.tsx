import type { Metadata } from "next";
import { absoluteLocalizedUrl } from "@/lib/routes";
import { languageAlternates } from "@/lib/page-metadata";
import { HeroSection } from "@/components/HeroSection";
import { WelcomePanelContent } from "@/components/WelcomePanelContent";
import { HomeWatchlistPanel } from "@/components/HomeWatchlistPanel";
import { ContinueWatching } from "@/components/ContinueWatching";
import { DailyGameTeaser } from "@/components/DailyGameTeaser";
import { WelcomeBack } from "@/components/WelcomeBack";
import { KeepYourDataNudge } from "@/components/KeepYourDataNudge";
import { RecommendedForYou } from "@/components/RecommendedForYou";
import { GenreQuickNav } from "@/components/GenreQuickNav";
import { StructuredData } from "@/components/StructuredData";
import { getHomeSnapshot } from "@/lib/build-time-tmdb";
import {
  TrendingCarousel,
  NowPlayingCarousel,
  PopularMoviesCarousel,
  PopularTVShowsCarousel,
  TopRatedMoviesCarousel,
  TopRatedTVShowsCarousel,
  AiringTodayCarousel,
  UpcomingMoviesCarousel,
} from "@/components/carousels";

/**
 * The Czech counterpart of `app/(en)/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the headings, the editorial copy – is
 * written here in Czech.
 */

export const metadata: Metadata = {
  // Title and description are the Czech root layout's own, written for this page.
  alternates: {
    canonical: absoluteLocalizedUrl("/", "cs"),
    languages: languageAlternates("/"),
  },
};

export default async function Home() {
  const rows = await getHomeSnapshot("cs");

  return (
    <>
      <StructuredData type="Website" locale="cs" data={{}} />
      <StructuredData type="WebApplication" locale="cs" data={{}} />
      <StructuredData type="Organization" locale="cs" data={{}} />
      <StructuredData
        type="FAQPage"
        locale="cs"
        data={{
          faqItems: [
            {
              question: "Co je WatchList?",
              answer:
                "WatchList je bezplatná webová aplikace, ve které budete mít přehled o všech filmech a seriálech, které chcete vidět. Sestavíte si vlastní seznam, objevíte, co je právě populární, a zjistíte, na které streamovací službě daný titul najdete – a to bez registrace.",
            },
            {
              question: "Je WatchList zdarma?",
              answer:
                "Ano, WatchList je zcela zdarma. Nemá žádné předplatné, registraci ani skryté poplatky. Seznam ke zhlédnutí, dostupnost na streamovacích službách i procházení filmů a seriálů máte k dispozici bez placení.",
            },
            {
              question: "Jak si přidám film nebo seriál na seznam?",
              answer:
                "Najděte film nebo seriál přes vyhledávání nebo v přehledech a klikněte na „Přidat na seznam“ – na stránce titulu nebo přímo na jeho kartě. Seznam se ukládá ve vašem prohlížeči, takže nepotřebujete žádný účet.",
            },
            {
              question: "Které streamovací služby WatchList pokrývá?",
              answer:
                "WatchList ukazuje, kde je titul právě k dispozici – Netflix, HBO Max, Disney+, Prime Video, Apple TV, SkyShowtime, Oneplay a řada dalších služeb. Dostupnost se zobrazuje pro každou zemi zvlášť, takže vždy víte, kde film nebo seriál uvidíte tam, kde jste.",
            },
            {
              question: "Mohu procházet filmy a seriály podle žánru?",
              answer:
                "Ano. Filmy i seriály můžete procházet podle žánrů – akční, komedie, drama, thriller, sci-fi, horor a mnoho dalších. Výběr si navíc zúžíte podle streamovací služby a seřadíte podle hodnocení nebo data vydání.",
            },
          ],
        }}
      />

      {/* Semantic h1 for SEO – visually hidden, hero section shows featured title as h2 */}
      <h1 className="sr-only">
        WatchList – váš seznam filmů a seriálů ke zhlédnutí zdarma
      </h1>

      <HeroSection />

      <div className="container mx-auto px-6 lg:px-8 py-8 space-y-12">
        <WelcomePanelContent />

        <WelcomeBack />

        <DailyGameTeaser />

        <ContinueWatching />

        <HomeWatchlistPanel />

        <RecommendedForYou />

        <TrendingCarousel snapshot={rows?.trending} />

        <div className="border-t border-gray-800/60 pt-10 space-y-12">
          <h2 className="text-3xl font-bold text-white">Filmy</h2>
          <NowPlayingCarousel headingLevel={3} snapshot={rows?.nowPlaying} />
          <PopularMoviesCarousel headingLevel={3} snapshot={rows?.popularMovies} />
          <UpcomingMoviesCarousel headingLevel={3} snapshot={rows?.upcomingMovies} />
          <TopRatedMoviesCarousel headingLevel={3} snapshot={rows?.topRatedMovies} />
        </div>

        <div className="border-t border-gray-800/60 pt-10 space-y-12">
          <h2 className="text-3xl font-bold text-white">Seriály</h2>
          <AiringTodayCarousel headingLevel={3} snapshot={rows?.airingToday} />
          <PopularTVShowsCarousel headingLevel={3} snapshot={rows?.popularTVShows} />
          <TopRatedTVShowsCarousel headingLevel={3} snapshot={rows?.topRatedTVShows} />
        </div>

        <div className="border-t border-gray-800/60 pt-10">
          <GenreQuickNav locale="cs" />
        </div>

        <KeepYourDataNudge />

        <section
          aria-labelledby="features-heading"
          className="border-t border-gray-800 pt-12"
        >
          <h2
            id="features-heading"
            className="text-2xl font-bold mb-4 text-white"
          >
            Seznam filmů a seriálů ke zhlédnutí – zdarma
          </h2>
          <p className="text-gray-400 leading-relaxed mb-8 max-w-3xl">
            S WatchListem máte přehled o všech filmech a seriálech, které chcete
            vidět – zdarma a bez registrace. Ať hledáte nový thriller na
            Netflixu, chcete dohnat oceňovaný seriál na HBO Max, nebo plánujete
            víkendový filmový maraton, všechno máte pohromadě na jednom místě.
          </p>
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 space-y-3">
              <h3 className="font-semibold text-white">
                Sestavte si vlastní seznam
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Jakýkoli film nebo seriál si na seznam přidáte jedním kliknutím.
                Budete mít přehled o tom, co chcete vidět – od novinek v kinech
                přes filmovou klasiku po seriály, na které jste se ještě
                nedostali. Bez registrace.
              </p>
            </div>
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 space-y-3">
              <h3 className="font-semibold text-white">
                Objevte, co se teď sleduje
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Procházejte trendy filmy, novinky v kinech, populární seriály a
                nejlépe hodnocené tituly, které se každý den aktualizují. Od
                kasovních trháků po seriály, od kterých se nedá odtrhnout –
                budete vědět, co se právě sleduje na Netflixu, HBO Max, Disney+
                i jinde.
              </p>
            </div>
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 space-y-3">
              <h3 className="font-semibold text-white">
                Zjistěte, kde co sledovat
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Na stránce každého filmu a seriálu uvidíte, kde je ve vaší zemi
                aktuálně k dispozici – jestli na Netflixu, HBO Max, Disney+,
                Prime Video, Apple TV nebo SkyShowtime. Už nemusíte přepínat mezi
                aplikacemi, abyste to zjistili.
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-6 mt-6">
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 space-y-3">
              <h3 className="font-semibold text-white">
                Filtrujte podle žánru a služby
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Výběr zúžíte pomocí filtrů: zvolte žánr, třeba akční, komedii,
                drama nebo sci-fi, vyberte streamovací služby, které máte, a
                seřaďte výsledky podle hodnocení nebo data vydání. Tak rychle
                najdete, co si pustit dnes večer.
              </p>
            </div>
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 space-y-3">
              <h3 className="font-semibold text-white">
                Obsazení, štáb a recenze na jednom místě
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Stránka každého titulu nabízí kompletní obsazení a štáb, recenze
                diváků, trailery, zajímavosti a podobné tituly – všechno, co
                potřebujete k rozhodnutí, co si pustit příště, a to bez
                opouštění stránky.
              </p>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="about-heading"
          className="border-t border-gray-800 pt-12"
        >
          <h2 id="about-heading" className="text-2xl font-bold mb-4 text-white">
            Jak WatchList funguje
          </h2>
          <div className="grid md:grid-cols-2 gap-10 text-gray-400 leading-relaxed">
            <div className="space-y-4">
              <p>
                WatchList čerpá aktuální data z The Movie Database (TMDb), takže
                máte přesné a čerstvé informace o tisících filmů a seriálů.
                Dostupnost na streamovacích službách se načítá pro každou zemi
                zvlášť – vidíte tedy, co jednotlivé služby skutečně nabízejí
                tam, kde jste.
              </p>
              <p>
                Váš seznam se ukládá přímo ve vašem prohlížeči – bez účtu, hesla
                i e-mailu. Zůstává soukromý v prohlížeči, který používáte, takže
                si můžete tituly začít ukládat hned teď.
              </p>
            </div>
            <div className="space-y-4">
              <p>
                Stránka každého filmu a seriálu spojuje oficiální údaje,
                obsazení a štáb, recenze diváků, zajímavosti a informace z
                Wikipedie do jednoho přehledného celku. Podívejte se na ni dřív,
                než filmu věnujete dvě hodiny nebo se pustíte do seriálu o
                několika řadách.
              </p>
              <p>
                Na stránkách žánrů najdete nejlepší akční filmy, nejlépe
                hodnocené dramatické seriály, dokumenty, které stojí za to
                vidět, a mnohem víc – vše s filtrem podle streamovací služby a
                země. Začněte tím, co je právě v trendu, nebo se ponořte do
                konkrétní kategorie.
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
