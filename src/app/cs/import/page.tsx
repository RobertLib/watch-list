import type { Metadata } from "next";
import Link from "@/i18n/Link";
import { pageMetadata } from "@/lib/page-metadata";
import { StructuredData } from "@/components/StructuredData";
import { ImportData } from "@/components/ImportData";
import { absoluteLocalizedUrl } from "@/lib/routes";
import { formatNumber } from "@/i18n/format";

/**
 * The Czech counterpart of `app/(en)/import/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 *
 * The menu names of the other services stay in English: none of them has a
 * Czech interface, so that is what the reader will see on screen.
 */

export const metadata: Metadata = pageMetadata({
  title: "Import z Letterboxd, IMDb, Trakt nebo TV Time",
  description:
    "Přeneste si seznam, zhlédnuté tituly, hodnocení a rozkoukané epizody z Letterboxd, IMDb, Trakt či TV Time. Načte se v prohlížeči – bez účtu a nahrávání.",
  path: "/import",
  locale: "cs",
});

/** What each service's export brings across, and how to get it. */
const SOURCES = [
  {
    name: "Letterboxd",
    how: (
      <>
        Na Letterboxd otevřete <strong>Settings → Data → Export Your Data</strong>.
        Stáhne se soubor ZIP – vyberte ho tady tak, jak je.
      </>
    ),
    brings:
      "Váš seznam ke zhlédnutí, zhlédnuté filmy, data z deníku a vaše hodnocení – hvězdičky z pěti se převedou na hodnocení z deseti.",
    note: "Letterboxd pozná film podle názvu a roku, a tak se každý dohledává v TMDB. Film, jehož název a rok ničemu v TMDB neodpovídají, se neodhaduje, ale vypíše se na konci.",
  },
  {
    name: "IMDb",
    how: (
      <>
        Na IMDb otevřete <strong>Your Watchlist</strong>, <strong>Your Ratings</strong>{" "}
        nebo kterýkoli seznam a zvolte <strong>Export</strong>. IMDb připraví
        soubor CSV ke stažení; vyberte ho tady. Klidně i několik souborů
        najednou.
      </>
    ),
    brings:
      "Hodnocení se přenesou jako body i jako zhlédnuté tituly. Watchlist nebo jakýkoli jiný seznam přibude jako tituly ke zhlédnutí.",
    note: "Watchlist i vlastní seznamy exportuje IMDb ve stejném tvaru, takže i seznam, který jste si vedli z jiného důvodu, skončí na vašem seznamu ke zhlédnutí. Jednotlivě hodnocené epizody se vynechají: tady pro ně není místo.",
  },
  {
    name: "Trakt",
    how: (
      <>
        Ve webové aplikaci Trakt otevřete <strong>Settings → Data → Export</strong>.
        Stáhne se ZIP s názvem <code>trakt-export-…</code>; vyberte tento soubor.
      </>
    ),
    brings:
      "Váš seznam ke zhlédnutí, zhlédnuté filmy, hodnocení a každá epizoda z vaší historie – odškrtnutá u svého seriálu, takže u každého navážete tam, kde jste skončili.",
    note: "Trakt si u titulů pamatuje jejich ID z TMDB, takže není co odhadovat. Kolekce, vlastní seznamy, komentáře a lajky se nenačítají.",
  },
  {
    name: "TV Time",
    how: (
      <>
        Služba TV Time skončila 15. července 2026 a nový export už si vyžádat
        nelze. Pokud jste si ho uložili dřív, vyberte ho tady: buď{" "}
        <code>gdpr-data.zip</code> z žádosti o data, nebo{" "}
        <code>tvtime-export-….zip</code>, který aplikace nabízela v posledních
        měsících.
      </>
    ),
    brings:
      "Každá zhlédnutá epizoda, odškrtnutá u svého seriálu; seriály, které jste si přidali, ale ještě nezačali sledovat, jako tituly ke zhlédnutí; a vaše filmy, zhlédnuté i ty ke zhlédnutí.",
    note: "Seriály se párují podle ID z TheTVDB, které si k nim ukládala služba TV Time. Filmy ve starším exportu žádné ID nemají – jen název, někdy přeložený, a datum vydání – takže některé se nenajdou.",
  },
] as const;

export default function ImportPage() {
  return (
    <div className="container mx-auto px-6 lg:px-8 py-12 max-w-3xl">
      <StructuredData
        type="BreadcrumbList"
        locale="cs"
        data={{
          breadcrumbItems: [
            { name: "Domů", url: absoluteLocalizedUrl("/", "cs") },
            { name: "Import", url: absoluteLocalizedUrl("/import", "cs") },
          ],
        }}
      />

      <h1 className="text-4xl font-extrabold text-white mb-4 tracking-tight">
        Importujte svůj seznam a historii
      </h1>
      <p className="text-gray-400 text-lg mb-8 leading-relaxed">
        Přeneste si, co už máte zaznamenané ve službách Letterboxd, IMDb, Trakt
        nebo TV Time: co chcete vidět, co jste viděli, jak jste to hodnotili
        a u které epizody právě jste. Nemusíte si zakládat žádný účet – export
        se načte ve vašem prohlížeči a vaše seznamy v něm zůstanou.
      </p>

      <ImportData />

      <section className="mt-14">
        <h2 className="text-2xl font-bold text-white mb-6">
          Kde export získáte
        </h2>
        <div className="space-y-8">
          {SOURCES.map((source) => (
            <div key={source.name}>
              <h3 className="text-lg font-semibold text-white mb-2">
                {source.name}
              </h3>
              <p className="text-gray-300 leading-relaxed">{source.how}</p>
              <p className="text-gray-400 leading-relaxed mt-2">
                <span className="text-gray-300">Co se přenese:</span>{" "}
                {source.brings}
              </p>
              <p className="text-gray-500 text-sm leading-relaxed mt-2">
                {source.note}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-bold text-white mb-3">
          Co import udělá a co ne
        </h2>
        <ul className="list-disc pl-5 text-gray-400 leading-relaxed space-y-2">
          <li>
            Jen přidává. Nic, co už na svých seznamech máte, se neodstraní ani
            nezmění, a hodnocení, které jste dali tady, importované nikdy
            nepřepíše.
          </li>
          <li>
            Titul, který jste podle exportu už viděli, z vašeho seznamu zmizí –
            stejně, jako když ho sami označíte jako zhlédnutý.
          </li>
          <li>
            Nic se neuloží, dokud nejsou dohledané všechny tituly, takže import
            můžete v půlce zrušit. A protože jen přidává, nevadí, když stejný
            soubor naimportujete dvakrát.
          </li>
          <li>
            Recenze, komentáře, lajky, sledující ani vlastní seznamy se
            neimportují. Stejně tak nic o vašem účtu.
          </li>
          <li>
            Každý seznam pojme {formatNumber(2000, "cs")} titulů. Z delší
            historie zůstane posledních {formatNumber(2000, "cs")}.
          </li>
        </ul>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-bold text-white mb-3">
          Kam vaše data putují
        </h2>
        <p className="text-gray-400 leading-relaxed">
          Nikam. Soubor otevře tato stránka přímo ve vašem prohlížeči a nikam
          se nenahrává. Aby se každý titul našel, vyhledá se jeho název nebo ID
          v TMDB – veřejné filmové databázi, kterou tu používá každá stránka.
          Co naimportujete, se uloží do úložiště tohoto prohlížeče, kde jsou
          i vaše ostatní seznamy. Žádný účet za tím není, a tak si po
          dokončení{" "}
          <Link
            href="/profile"
            prefetch={false}
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            stáhněte zálohu
          </Link>
          .
        </p>
      </section>

      <section className="mt-14 rounded-xl border border-gray-800 bg-gray-900/60 p-6">
        <h2 className="font-semibold text-white">Přecházíte z TV Time?</h2>
        <p className="text-sm text-gray-400 mt-1 leading-relaxed">
          Co z toho, co nabízela služba TV Time, tu najdete, co ne a co dělat,
          když jste si export nikdy neuložili.
        </p>
        <Link
          href="/tv-time-alternative"
          prefetch={false}
          className="inline-block mt-3 text-blue-400 hover:text-blue-300 transition-colors"
        >
          WatchList jako alternativa k TV Time →
        </Link>
      </section>
    </div>
  );
}
