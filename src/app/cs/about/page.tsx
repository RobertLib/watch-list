import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import Link from "@/i18n/Link";
import { StructuredData } from "@/components/StructuredData";
import { absoluteLocalizedUrl } from "@/lib/routes";

/**
 * The Czech counterpart of `app/(en)/about/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the headings, the copy – is written here in
 * Czech.
 */

export const metadata: Metadata = pageMetadata({
  title: "O aplikaci",
  description:
    "Co je WatchList, kdo za ním stojí a proč k přehledu o filmech a seriálech, které chcete vidět, nepotřebujete účet ani předplatné.",
  path: "/about",
  locale: "cs",
});

export default function AboutPage() {
  return (
    <div className="container mx-auto px-6 lg:px-8 py-16 max-w-3xl">
      <StructuredData
        type="BreadcrumbList"
        locale="cs"
        data={{
          breadcrumbItems: [
            { name: "Domů", url: absoluteLocalizedUrl("/", "cs") },
            { name: "O aplikaci", url: absoluteLocalizedUrl("/about", "cs") },
          ],
        }}
      />

      <h1 className="text-4xl font-extrabold text-white mb-4 tracking-tight">
        O aplikaci WatchList
      </h1>
      <p className="text-gray-400 text-lg mb-10 leading-relaxed">
        WatchList je bezplatný nástroj, který vám pomůže najít filmy a seriály
        dostupné na streamovacích službách, které už máte předplacené.
      </p>

      <section className="mb-10">
        <h2 className="text-2xl font-bold text-white mb-3">Co umí</h2>
        <p className="text-gray-400 leading-relaxed">
          Místo přepínání mezi Netflixem, Disney+, HBO Max, SkyShowtime a
          dalšími službami, abyste zjistili, co na nich zrovna běží, si ve
          WatchListu vyberete své služby a hned uvidíte, co můžete sledovat
          právě teď. Nabídku zúžíte podle žánru, jazyka a hodnocení a najdete
          něco, co sedí vaší náladě – aniž byste za cokoli platili navíc.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-bold text-white mb-3">Jak to funguje</h2>
        <p className="text-gray-400 leading-relaxed">
          Údaje o filmech a seriálech pocházejí z databáze{" "}
          <a
            href="https://www.themoviedb.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            The Movie Database (TMDb)
          </a>
          . Dostupnost na streamovacích službách poskytuje{" "}
          <a
            href="https://www.justwatch.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            JustWatch
          </a>{" "}
          prostřednictvím API služby TMDb. WatchList z těchto dat skládá
          aktuální přehled toho, co je v trendu, co nově přibylo a co má
          nejlepší hodnocení – podle vaší země a vašich streamovacích služeb.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-bold text-white mb-3">Soukromí</h2>
        <p className="text-gray-400 leading-relaxed">
          WatchList nevyžaduje účet. Váš seznam, zhlédnuté tituly, postup ve
          sledování epizod, hodnocení, zvolená země a streamovací služby se
          ukládají v úložišti tohoto prohlížeče. Neexistuje žádný účet
          WatchList ani kopie vašich osobních záznamů na serveru.
        </p>
        <p className="text-gray-400 leading-relaxed mt-4">
          Aby se na webu mohly zobrazit informace, obrací se váš prohlížeč na
          tyto externí služby:
        </p>
        <ul className="text-gray-400 leading-relaxed mt-3 space-y-2 list-disc pl-5">
          <li>
            <span className="text-gray-300">TMDb</span> – katalogy, plakáty,
            doporučení, podrobnosti o titulech a dostupnost na streamovacích
            službách. Požadavky obsahují ID titulů nebo osob, hledané výrazy a
            kódy země a služeb potřebné k filtrování. Dostupnost, doporučení,
            kalendáře a statistiky navíc používají ID z vašich uložených
            seznamů nebo historie sledování, aby k nim dohledaly příslušné
            tituly.
          </li>
          <li>
            <span className="text-gray-300">Wikipedie</span> – doplňující
            informace o pozadí zobrazené na některých stránkách titulů;
            vyžadují se podle názvu, když stránku otevřete.
          </li>
          <li>
            <span className="text-gray-300">YouTube</span> – náhledy trailerů
            a po spuštění přehrávání i samotný přehrávač. Trailery se vkládají
            přes youtube-nocookie.com.
          </li>
          <li>
            <span className="text-gray-300">Google Analytics</span> –
            volitelné měření návštěvnosti, zapnuté jen tehdy, když ho
            provozovatel webu nastaví. Pokud je zapnuté, dostává informace o
            návštěvách a adresách stránek a může používat cookies. WatchList
            funguje i bez něj.
          </li>
        </ul>
        <p className="text-gray-400 leading-relaxed mt-4">
          Externí služby dostávají vaši IP adresu a údaje potřebné pro každý
          požadavek. Vaše hodnocení a postup ve sledování epizod se zpracovávají
          lokálně. Pokud se rozhodnete sdílet seznam, jeho odkaz obsahuje ID
          titulů a název seznamu, pokud ho zadáte; kdokoli s tímto odkazem si
          seznam může prohlédnout.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold text-white mb-3">
          Otevřený zdrojový kód
        </h2>
        <p className="text-gray-400 leading-relaxed">
          WatchList je open source. Na{" "}
          <a
            href="https://github.com/RobertLib/watch-list"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            GitHubu
          </a>{" "}
          si můžete prohlédnout kód, nahlásit chybu nebo přispět vlastní
          úpravou.
        </p>
      </section>

      <div className="flex gap-4">
        <Link
          href="/movies"
          prefetch={false}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
        >
          Procházet filmy
        </Link>
        <Link
          href="/tv-shows"
          prefetch={false}
          className="inline-flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
        >
          Procházet seriály
        </Link>
      </div>
    </div>
  );
}
