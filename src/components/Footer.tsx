import { Heart } from "lucide-react";
import Link from "@/i18n/Link";
import { LanguageSwitch } from "@/i18n/LanguageSwitch";
import { t as translate, type Locale } from "@/i18n/locale";

export function Footer({ locale = "en" }: { locale?: Locale }) {
  const t = (en: string, cs: string) => translate(locale, en, cs);
  return (
    <footer
      className="bg-gray-900 border-t border-gray-800 mt-16"
      role="contentinfo"
    >
      <div className="container mx-auto px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* About */}
          <div>
            <h3 className="text-white font-semibold mb-4">
              {t("About WatchList", "O WatchListu")}
            </h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              {t(
                "Discover the best movies and TV shows across all streaming platforms. Never miss what's trending and find your next favorite watch.",
                "Objevujte nejlepší filmy a seriály napříč všemi streamovacími službami. Nic populárního vám neuteče a další oblíbený titul najdete snadno.",
              )}
            </p>
            <LanguageSwitch className="mt-4" />
          </div>

          {/* Links */}
          <div>
            <h3 className="text-white font-semibold mb-4">
              {t("Quick Links", "Rychlé odkazy")}
            </h3>
            <nav
              className="space-y-2"
              aria-label={t("Footer navigation", "Navigace v patičce")}
            >
              <Link
                href="/movies"
                prefetch={false}
                className="block text-gray-400 hover:text-white text-sm transition-colors focus:outline-none focus:text-white"
              >
                {t("Popular Movies", "Populární filmy")}
              </Link>
              <Link
                href="/tv-shows"
                prefetch={false}
                className="block text-gray-400 hover:text-white text-sm transition-colors focus:outline-none focus:text-white"
              >
                {t("Popular TV Shows", "Populární seriály")}
              </Link>
              <Link
                href="/genres"
                prefetch={false}
                className="block text-gray-400 hover:text-white text-sm transition-colors focus:outline-none focus:text-white"
              >
                {t("Browse Genres", "Procházet žánry")}
              </Link>
              <Link
                href="/people"
                prefetch={false}
                className="block text-gray-400 hover:text-white text-sm transition-colors focus:outline-none focus:text-white"
              >
                {t("People", "Osobnosti")}
              </Link>
              <Link
                href="/about"
                prefetch={false}
                className="block text-gray-400 hover:text-white text-sm transition-colors focus:outline-none focus:text-white"
              >
                {t("About WatchList", "O WatchListu")}
              </Link>
            </nav>
          </div>

          {/* The things that answer "what now" rather than "what exists". */}
          <div>
            <h3 className="text-white font-semibold mb-4">
              {t("Decide & Play", "Vybírejte a hrajte")}
            </h3>
            <nav
              className="space-y-2"
              aria-label={t("Tools and games", "Nástroje a hry")}
            >
              <Link
                href="/tonight"
                prefetch={false}
                className="block text-gray-400 hover:text-white text-sm transition-colors focus:outline-none focus:text-white"
              >
                {t("What to watch tonight", "Co dnes večer sledovat")}
              </Link>
              <Link
                href="/moods"
                prefetch={false}
                className="block text-gray-400 hover:text-white text-sm transition-colors focus:outline-none focus:text-white"
              >
                {t("Browse by mood", "Podle nálady")}
              </Link>
              <Link
                href="/match"
                prefetch={false}
                className="block text-gray-400 hover:text-white text-sm transition-colors focus:outline-none focus:text-white"
              >
                {t("What should we watch?", "Na co se podíváme?")}
              </Link>
              <Link
                href="/daily"
                prefetch={false}
                className="block text-gray-400 hover:text-white text-sm transition-colors focus:outline-none focus:text-white"
              >
                {t("Daily film puzzle", "Denní filmová hádanka")}
              </Link>
              <Link
                href="/daily/higher-lower"
                prefetch={false}
                className="block text-gray-400 hover:text-white text-sm transition-colors focus:outline-none focus:text-white"
              >
                {t("Higher or lower", "Vyšší, nebo nižší")}
              </Link>
              <Link
                href="/lists"
                prefetch={false}
                className="block text-gray-400 hover:text-white text-sm transition-colors focus:outline-none focus:text-white"
              >
                {t("Your lists", "Vaše seznamy")}
              </Link>
              <Link
                href="/ratings"
                prefetch={false}
                className="block text-gray-400 hover:text-white text-sm transition-colors focus:outline-none focus:text-white"
              >
                {t("Everything you rated", "Vše, co jste ohodnotili")}
              </Link>
              <Link
                href="/stats"
                prefetch={false}
                className="block text-gray-400 hover:text-white text-sm transition-colors focus:outline-none focus:text-white"
              >
                {t("Your stats", "Vaše statistiky")}
              </Link>
              <Link
                href="/import"
                prefetch={false}
                className="block text-gray-400 hover:text-white text-sm transition-colors focus:outline-none focus:text-white"
              >
                {t("Import from Letterboxd, IMDb, Trakt", "Import z Letterboxd, IMDb, Trakt")}
              </Link>
              <Link
                href="/tv-time-alternative"
                prefetch={false}
                className="block text-gray-400 hover:text-white text-sm transition-colors focus:outline-none focus:text-white"
              >
                {t("TV Time alternative", "Alternativa k TV Time")}
              </Link>
            </nav>
          </div>

          {/* Data Sources */}
          <div>
            <h3 className="text-white font-semibold mb-4">
              {t("Data Sources", "Zdroje dat")}
            </h3>
            <p className="text-gray-400 text-sm mb-4">
              {t("Powered by", "Data poskytuje")}{" "}
              <a
                href="https://www.themoviedb.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 rounded"
                aria-label={t(
                  "Visit The Movie Database website (opens in new tab)",
                  "Web The Movie Database (otevře se v nové kartě)",
                )}
              >
                The Movie Database (TMDb)
              </a>
            </p>
            <p className="text-gray-400 text-sm mb-4">
              {t("Streaming availability by", "Dostupnost na streamovacích službách:")}{" "}
              <a
                href="https://www.justwatch.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 rounded"
                aria-label={t(
                  "Visit JustWatch website (opens in new tab)",
                  "Web JustWatch (otevře se v nové kartě)",
                )}
              >
                JustWatch
              </a>
              {t(", via TMDb.", ", přes TMDb.")}
            </p>
            <a
              href="https://github.com/RobertLib/watch-list"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 rounded"
              aria-label={t(
                "View source code on GitHub (opens in new tab)",
                "Zdrojový kód na GitHubu (otevře se v nové kartě)",
              )}
            >
              {t("View on GitHub", "Zdrojový kód na GitHubu")}
            </a>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-gray-400 text-sm">
            © {new Date().getFullYear()} WatchList.{" "}
            {t("All rights reserved.", "Všechna práva vyhrazena.")}
          </p>
          <p className="text-gray-400 text-sm flex items-center gap-1 mt-4 md:mt-0">
            {t("Made with", "Vytvořeno s")}{" "}
            <Heart
              className="w-4 h-4 text-red-500"
              aria-label={t("love", "láskou")}
            />{" "}
            {t("for movie lovers", "pro milovníky filmů")}
          </p>
        </div>
      </div>
    </footer>
  );
}
