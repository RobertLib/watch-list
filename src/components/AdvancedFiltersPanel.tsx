"use client";

import { useState } from "react";
import { DiscoverFilterBar } from "./DiscoverFilterBar";
import { LoadFailureNotice } from "./LoadFailureNotice";
import { useGenres } from "@/contexts/GenresContext";
import type { DiscoverMediaType } from "@/lib/discover-filters";
import { useLocale, useT } from "@/i18n/LocaleProvider";

interface AdvancedFiltersPanelProps {
  type: DiscoverMediaType;
  isExpanded?: boolean;
}

export function AdvancedFiltersPanel({
  type,
  isExpanded = false,
}: AdvancedFiltersPanelProps) {
  const [isOpen, setIsOpen] = useState(isExpanded);
  const { movieGenres, tvGenres, movieFailed, tvFailed, loading, requestGenres } = useGenres();
  const genresFailed = type === "movie" ? movieFailed : tvFailed;
  const locale = useLocale();
  const t = useT();

  return (
    <div className="bg-gray-900/50 rounded-lg mb-8 overflow-hidden">
      {/* Toggle Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-white hover:bg-gray-800/50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
        aria-expanded={isOpen}
        aria-controls="filters-panel"
        aria-label={
          isOpen
            ? t("Collapse advanced filters", "Sbalit pokročilé filtry")
            : t("Expand advanced filters", "Rozbalit pokročilé filtry")
        }
      >
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">
            {t("Advanced Filters & Sorting", "Pokročilé filtry a řazení")}
          </span>
          <span className="text-sm text-gray-400">
            {t(
              "(Sort, filter by year, genre, rating, and more)",
              "(řazení, rok, žánr, hodnocení a další)",
            )}
          </span>
        </div>
        <div
          className={`transform transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {/* Collapsible Content. Animating the grid row instead of a max-height
          keeps tall content (stacked selects on a phone) from being clipped. */}
      <div
        id="filters-panel"
        className={`grid transition-all duration-300 ease-in-out ${
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
        aria-hidden={!isOpen}
        inert={!isOpen ? true : undefined}
      >
        {/* The padding lives one level deeper so it collapses with the row. */}
        <div className="overflow-hidden">
          <div className="p-4 pt-0 border-t border-gray-700">
            {genresFailed && (loading ? (
              <p role="status" className="text-sm text-gray-400 py-4">
                {t("Retrying genres…", "Znovu načítáme žánry…")}
              </p>
            ) : (
              <LoadFailureNotice
                title={t(
                  "Could not load genre choices",
                  "Nabídku žánrů se nepodařilo načíst",
                )}
                description={t(
                  "The other filters are still available.",
                  "Ostatní filtry fungují dál.",
                )}
                onRetry={requestGenres}
                compact
              />
            ))}
            <DiscoverFilterBar
              type={type}
              genres={type === "movie" ? movieGenres : tvGenres}
            />

            {/* Filter Tips */}
            <div className="mt-4 p-3 bg-blue-900/20 border border-blue-700/30 rounded-md">
              <h4 className="text-sm font-medium text-blue-300 mb-2">
                {t("💡 Filter Tips:", "💡 Tipy k filtrům:")}
              </h4>
              {locale === "cs" ? (
                <ul className="text-xs text-blue-200 space-y-1">
                  <li>
                    • V nabídce Řadit podle seřadíte výsledky podle popularity,
                    hodnocení, data premiéry nebo názvu
                  </li>
                  <li>
                    • Rok premiéry najde {type === "movie" ? "filmy" : "seriály"}{" "}
                    z konkrétního roku
                  </li>
                  <li>
                    • Žánrem si zúžíte výběr na kategorie, které máte nejraději
                  </li>
                  <li>
                    • Min. hodnocení počítá jen s tituly, které mají dost hlasů –
                    dostanete opravdu dobře hodnocené tituly, ne náhodné výkyvy
                    z pár hlasů
                  </li>
                  <li>
                    • Původní jazyk najde tituly natočené v konkrétním jazyce
                  </li>
                  <li>
                    • Streamovací služba zúží výsledky na služby uložené ve
                    vašem profilu, nebo na jednu službu dostupnou ve vašem
                    regionu – hodí se, když zvažujete, co by vám dala služba,
                    kterou zatím nemáte
                  </li>
                  <li>
                    • Jednotlivý filtr odeberete křížkem ✕ na jeho štítku, vše
                    najednou tlačítkem „Zrušit filtry“
                  </li>
                </ul>
              ) : (
                <ul className="text-xs text-blue-200 space-y-1">
                  <li>
                    • Use Sort By to order results by popularity, rating, release
                    date, or title
                  </li>
                  <li>
                    • Filter by Year to find{" "}
                    {type === "movie" ? "movies" : "TV shows"} from specific years
                  </li>
                  <li>
                    • Select a Genre to discover content in your favorite
                    categories
                  </li>
                  <li>
                    • Min. Rating only counts titles with enough votes, so you get
                    genuinely well-rated content instead of obscure one-off
                    ratings
                  </li>
                  <li>
                    • Choose Original Language to find content produced in a
                    specific language
                  </li>
                  <li>
                    • Streaming Platform narrows results to the platforms saved in
                    your profile, or to any single platform available in your
                    region – handy for checking what a service you don&apos;t have
                    yet would give you
                  </li>
                  <li>
                    • Remove a single filter with its ✕ chip, or click &ldquo;Clear
                    Filters&rdquo; to reset everything
                  </li>
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
