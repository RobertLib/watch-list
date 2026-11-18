import type { Metadata } from "next";
import Link from "@/i18n/Link";
import { pageMetadata } from "@/lib/page-metadata";
import { StructuredData } from "@/components/StructuredData";
import { absoluteLocalizedUrl } from "@/lib/routes";

/**
 * The Czech counterpart of `app/(en)/tv-time-alternative/page.tsx`. Kept a file of its own, like every
 * page in this tree: the components are shared and speak the page's language,
 * and what differs – the metadata, the odd heading – is written here in Czech.
 *
 * The same rule as the English page: what the app does not do is said as
 * plainly as what it does, and every claim matches the English one.
 */

export const metadata: Metadata = pageMetadata({
  title: "Alternativa k TV Time bez účtu",
  description:
    "Služba TV Time skončila v červenci 2026. WatchList zdarma sleduje epizody, váš seznam i nové díly přímo v prohlížeči a načte i uložený export z TV Time.",
  path: "/tv-time-alternative",
  locale: "cs",
});

export default function TVTimeAlternativePage() {
  return (
    <div className="container mx-auto px-6 lg:px-8 py-12 max-w-3xl">
      <StructuredData
        type="BreadcrumbList"
        locale="cs"
        data={{
          breadcrumbItems: [
            { name: "Domů", url: absoluteLocalizedUrl("/", "cs") },
            {
              name: "Alternativa k TV Time",
              url: absoluteLocalizedUrl("/tv-time-alternative", "cs"),
            },
          ],
        }}
      />

      <h1 className="text-4xl font-extrabold text-white mb-4 tracking-tight">
        Alternativa k TV Time bez účtu
      </h1>
      <p className="text-gray-400 text-lg mb-10 leading-relaxed">
        Služba TV Time skončila 15. července 2026 a s ní zmizela i historie
        sledování, kterou si v ní lidé roky vedli. WatchList hlídá totéž – co
        právě sledujete, u které epizody jste a co vyjde příště – bez účtu,
        který by vám mohl kdokoli zrušit.
      </p>

      <section className="mb-10">
        <h2 className="text-2xl font-bold text-white mb-3">
          Pokud jste si data z TV Time uložili
        </h2>
        <p className="text-gray-400 leading-relaxed">
          Než služba skončila, šlo si z ní stáhnout vlastní data:{" "}
          <code>gdpr-data.zip</code> z žádosti o data, nebo v posledních
          měsících <code>tvtime-export-….zip</code> přímo z aplikace. Tady se
          dá načíst kterýkoli z nich. Zhlédnuté epizody se odškrtnou u svých
          seriálů, seriály, které jste ještě nezačali, přibudou na seznam,
          a filmy se přenesou jako zhlédnuté nebo ke zhlédnutí.
        </p>
        <Link
          href="/import"
          prefetch={false}
          className="inline-flex items-center mt-4 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 font-semibold text-white transition-colors"
        >
          Importovat export z TV Time
        </Link>
        <p className="text-gray-500 text-sm leading-relaxed mt-4">
          Pokud jste si ho nikdy neuložili, data už si vyžádat nejde. Jestli
          jste je mezitím přesunuli do Traktu, dá se sem importovat i export
          z Traktu. Jinak můžete seriály, které si pamatujete, přidat zpátky
          přes vyhledávání – a celou řadu odškrtnete jedním kliknutím.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-bold text-white mb-3">
          Co tu najdete stejně jako v TV Time
        </h2>
        <ul className="list-disc pl-5 text-gray-400 leading-relaxed space-y-2">
          <li>
            <span className="text-gray-200">Sledování epizod.</span> Epizody
            odškrtávejte po jedné, nebo celou řadu najednou. Každý seriál má
            ukazatel postupu a úvodní stránka začíná další nezhlédnutou
            epizodou každého seriálu, který máte rozkoukaný.
          </li>
          <li>
            <span className="text-gray-200">Co vyjde příště.</span>{" "}
            <Link
              href="/calendar"
              prefetch={false}
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              Kalendář vydání
            </Link>{" "}
            nadcházejících epizod a filmových premiér všeho, co sledujete.
            Dá se exportovat do vaší vlastní kalendářové aplikace.
          </li>
          <li>
            <span className="text-gray-200">Jeden seznam pro filmy
            i seriály</span>, který si můžete seřadit a seskupit podle toho, na
            které z vašich streamovacích služeb je titul právě k dispozici.
          </li>
          <li>
            <span className="text-gray-200">Hodnocení a statistiky.</span>{" "}
            Ohodnoťte cokoli na stupnici do deseti a podívejte se na počet
            zhlédnutých hodin, nejčastější žánry i shrnutí roku.
          </li>
          <li>
            <span className="text-gray-200">Kde sledovat</span>, pro víc než
            dvě stě zemí.
          </li>
          <li>
            <span className="text-gray-200">Profily</span>, aby si dva lidé
            u jednoho prohlížeče vedli každý svůj seznam.
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-bold text-white mb-3">Co neumí</h2>
        <ul className="list-disc pl-5 text-gray-400 leading-relaxed space-y-2">
          <li>
            <span className="text-gray-200">Žádná komunita.</span> Pod
            epizodami nejsou komentáře, reakce ani seznam přátel. Pokud jste
            TV Time otevírali právě kvůli tomu, tohle za něj náhrada není.
          </li>
          <li>
            <span className="text-gray-200">
              Žádná synchronizace mezi zařízeními.
            </span>{" "}
            Vaše seznamy žijí v prohlížeči, ve kterém jste je vytvořili. Když
            je chcete přenést nebo mít v bezpečí, stáhnete si soubor se zálohou
            a obnovíte ho jinde. Služby postavené na účtu, jako Trakt nebo
            Simkl, se synchronizují samy; tahle účet záměrně nemá.
          </li>
          <li>
            <span className="text-gray-200">Žádné automatické sledování.</span>{" "}
            Nic nehlídá, co si pouštíte na Netflixu. Co jste viděli, si
            odškrtnete sami.
          </li>
          <li>
            <span className="text-gray-200">Žádná aplikace z obchodu.</span>{" "}
            Je to web, který si nainstalujete na plochu telefonu a který funguje
            i offline – ne nativní aplikace.
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-bold text-white mb-3">
          Proč právě bez účtu
        </h2>
        <p className="text-gray-400 leading-relaxed">
          Historie z TV Time ležela v databázi TV Time, takže když firma
          skončila, skončila i historie. Tady žádná vaše databáze, kterou by
          šlo vypnout, není: všechno, co sledujete, ukládá váš vlastní
          prohlížeč, web tvoří jen statické soubory a{" "}
          <a
            href="https://github.com/RobertLib/watch-list"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            kód je otevřený
          </a>
          . Daní za to je výše zmíněné omezení – nic se nesynchronizuje, pokud
          zálohu nepřenesete sami. Záloha je ale obyčejný soubor, který si
          můžete otevřít, takže případný další přesun začne od něčeho, co už
          máte v ruce.
        </p>
      </section>

      <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-white">Začněte bez exportu</h2>
          <p className="text-sm text-gray-400 mt-1">
            Najděte seriál, odškrtněte, kam jste došli, a je to.
          </p>
        </div>
        <Link
          href="/tv-shows"
          prefetch={false}
          className="inline-flex items-center px-5 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 font-semibold text-white transition-colors shrink-0"
        >
          Procházet seriály
        </Link>
      </section>
    </div>
  );
}
