"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LANGUAGES, languageName, releaseYears } from "@/types/filters";
import {
  buildDiscoverFilterQuery,
  DEFAULT_SORT,
  formatResultCount,
  getSortOptions,
  hasActiveDiscoverFilters,
  MIN_RATING_OPTIONS,
  parseDiscoverFilters,
  type DiscoverFilters,
  type DiscoverMediaType,
  type GenreParamKey,
} from "@/lib/discover-filters";
import { useStreamingProviders } from "@/hooks/useStreamingProviders";
import { ANY_PROVIDERS, MY_PROVIDERS } from "@/lib/watch-provider-settings";
import type { Genre } from "@/types/tmdb";
import { genreName } from "@/lib/genre-catalog";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import type { Locale } from "@/i18n/locale";

const SELECT_CLASS =
  "w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
const LABEL_CLASS = "block text-sm font-medium text-gray-300 mb-2";

/**
 * A filter language as the option list shows it. Czech writes language names
 * in lower case ("angličtina"), which is right inside a sentence or a chip
 * ("Jazyk: angličtina") but reads oddly as the first word of a list entry.
 */
function languageOptionLabel(
  language: (typeof LANGUAGES)[number],
  locale: Locale,
): string {
  const name = languageName(language, locale);
  return locale === "cs"
    ? name.charAt(0).toLocaleUpperCase("cs") + name.slice(1)
    : name;
}

/**
 * The bar's footprint, for the prerendered HTML.
 *
 * The bar reads its state from the query string, which a prerender does not
 * have, so a page that prerenders its listing (`GenreListing`) puts this in its
 * place until the browser renders the real one. Same box, same grid, same six
 * controls' height – so the listing below does not jump when the bar arrives.
 */
export function DiscoverFilterBarSkeleton({ emptyHint }: { emptyHint?: string }) {
  return (
    <div className="bg-gray-900/50 rounded-lg p-6 mb-8" aria-hidden="true">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}>
            <div className="h-5 w-24 mb-2 bg-gray-800 rounded animate-pulse" />
            <div className="h-[42px] bg-gray-800 border border-gray-700 rounded-md" />
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-gray-700 flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-400">{emptyHint ?? " "}</span>
      </div>
    </div>
  );
}

interface DiscoverFilterBarProps {
  type: DiscoverMediaType;
  /** Options of the genre select. */
  genres: Genre[];
  /**
   * On the genre detail pages the select narrows the listing with a *second*
   * genre, so it is labelled differently and travels under its own query key.
   */
  genreParamKey?: GenreParamKey;
  genreLabel?: string;
  genreAllLabel?: string;
  /** When given, the bar shows the result count (and its own pending state). */
  totalResults?: number;
  /**
   * Set while the listing the bar filters is still fetching. The bar's own
   * transition ends as soon as the URL has changed, which is before the new
   * results have even been asked for – so on its own, "Updating results…"
   * would be gone again before the request it describes went out.
   */
  resultsPending?: boolean;
  /** Shown in place of the active-filter chips while nothing is filtered. */
  emptyHint?: string;
  /**
   * Query parameters that identify the listing rather than filter it – the genre
   * and platform a genre page is *about*. Every push carries them along, because
   * dropping them would navigate away from the page instead of filtering it.
   */
  keepParams?: Record<string, string>;
}

export function DiscoverFilterBar({
  type,
  genres,
  genreParamKey = "genre",
  genreLabel: genreLabelProp,
  genreAllLabel: genreAllLabelProp,
  totalResults,
  resultsPending = false,
  emptyHint,
  keepParams,
}: DiscoverFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const locale = useLocale();
  const t = useT();
  const genreLabel = genreLabelProp ?? t("Genre", "Žánr");
  const genreAllLabel = genreAllLabelProp ?? t("All Genres", "Všechny žánry");

  const sortOptions = getSortOptions(type);
  const sortLabel = (option: (typeof sortOptions)[number]) =>
    locale === "cs" ? option.labelCs : option.label;
  const isMovie = type === "movie";

  const {
    providers,
    myProviders,
    otherProviders,
    isLoading: isLoadingProviders,
  } = useStreamingProviders(type);

  // The URL is the single source of truth – every control reads the validated
  // filters back out of it, so a shared link reproduces the exact same view.
  const filters = parseDiscoverFilters(searchParams, type, genreParamKey);
  const hasFilters = hasActiveDiscoverFilters(filters);

  // Filter changes reset pagination and drop any quick-filter preset, since the
  // preset and the individual filters describe two different result sets.
  const withKeptParams = (query: string) => {
    const params = new URLSearchParams(query);
    for (const [key, value] of Object.entries(keepParams ?? {})) {
      if (value) params.set(key, value);
    }

    const result = params.toString();
    return result ? `${pathname}?${result}` : pathname;
  };

  const applyFilters = (patch: Partial<DiscoverFilters>) => {
    const nextFilters = { ...filters, ...patch };
    startTransition(() => {
      router.push(
        withKeptParams(buildDiscoverFilterQuery(nextFilters, 1, genreParamKey)),
        { scroll: false },
      );
    });
  };

  const clearFilters = () => {
    startTransition(() => {
      router.push(withKeptParams(""), { scroll: false });
    });
  };

  // The platform list only arrives after the first paint, and a shared link can
  // name a platform the current region no longer offers, so the selected value
  // never depends on the list being there.
  const selectedProviderName = providers.find(
    (provider) => String(provider.provider_id) === filters.provider,
  )?.provider_name;
  const isUnlistedProvider = Boolean(
    filters.provider &&
      filters.provider !== ANY_PROVIDERS &&
      filters.provider !== MY_PROVIDERS &&
      !selectedProviderName,
  );
  const showMyProvidersOption =
    myProviders.length > 0 || filters.provider === MY_PROVIDERS;
  const myProvidersLabel = isLoadingProviders
    ? t("My Platforms", "Moje služby")
    : myProviders.length > 0
      ? t(
          `My Platforms (${myProviders.length})`,
          `Moje služby (${myProviders.length})`,
        )
      : t("My Platforms (none picked yet)", "Moje služby (zatím žádné)");

  const activeChips: {
    key: string;
    label: string;
    patch: Partial<DiscoverFilters>;
  }[] = [];

  if (filters.sortBy) {
    const selected = sortOptions.find((o) => o.value === filters.sortBy);
    activeChips.push({
      key: "sortBy",
      label: `${t("Sort", "Řazení")}: ${selected && sortLabel(selected)}`,
      patch: { sortBy: "" },
    });
  }
  if (filters.year) {
    activeChips.push({
      key: "year",
      label: `${isMovie ? t("Year", "Rok") : t("First aired", "Rok")}: ${filters.year}`,
      patch: { year: "" },
    });
  }
  if (filters.minRating) {
    activeChips.push({
      key: "minRating",
      label: `${t("Rating", "Hodnocení")}: ${filters.minRating}+`,
      patch: { minRating: "" },
    });
  }
  if (filters.language) {
    const selected = LANGUAGES.find((l) => l.code === filters.language);
    activeChips.push({
      key: "language",
      label: `${t("Language", "Jazyk")}: ${selected && languageName(selected, locale)}`,
      patch: { language: "" },
    });
  }
  if (filters.genre) {
    const selected = genres.find((g) => String(g.id) === filters.genre);
    activeChips.push({
      key: "genre",
      label: `${genreLabel}: ${selected ? genreName(selected, locale) : filters.genre}`,
      patch: { genre: "" },
    });
  }
  if (filters.provider) {
    activeChips.push({
      key: "provider",
      label: `${t("Platform", "Služba")}: ${
        filters.provider === MY_PROVIDERS
          ? t("My platforms", "Moje služby")
          : filters.provider === ANY_PROVIDERS
            ? t("Any platform", "Jakákoli služba")
            : (selectedProviderName ?? `#${filters.provider}`)
      }`,
      patch: { provider: "" },
    });
  }

  return (
    <div className="bg-gray-900/50 rounded-lg p-6 mb-8">
      <fieldset>
        <legend className="sr-only">
          {locale === "cs" ? (
            <>Filtry a řazení {isMovie ? "filmů" : "seriálů"}</>
          ) : (
            <>Filter and sort options for {isMovie ? "movies" : "TV shows"}</>
          )}
        </legend>

        {/* Every select is named by the <label> above it, and by nothing else.
            Each used to carry an `aria-label` as well, which replaced the
            visible text: "Min. Rating" was announced as "Filter by minimum
            rating" and "Sort By" as "Sort content by", so a voice command
            naming the control on screen found nothing (WCAG 2.5.3). */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* Sort By */}
          <div>
            <label htmlFor="filter-sort-select" className={LABEL_CLASS}>
              {t("Sort By", "Řadit podle")}
            </label>
            <select
              id="filter-sort-select"
              value={filters.sortBy}
              onChange={(e) => applyFilters({ sortBy: e.target.value })}
              className={SELECT_CLASS}
            >
              {/* The default sort is represented by an empty value so that it
                  never shows up in the URL. */}
              <option value="">{t("Most Popular", "Nejpopulárnější")}</option>
              {sortOptions
                .filter((option) => option.value !== DEFAULT_SORT)
                .map((option) => (
                  <option key={option.value} value={option.value}>
                    {sortLabel(option)}
                  </option>
                ))}
            </select>
          </div>

          {/* Year */}
          <div>
            <label htmlFor="filter-year-select" className={LABEL_CLASS}>
              {isMovie
                ? t("Release Year", "Rok premiéry")
                : t("First Air Year", "Rok premiéry")}
            </label>
            <select
              id="filter-year-select"
              value={filters.year}
              onChange={(e) => applyFilters({ year: e.target.value })}
              className={SELECT_CLASS}
            >
              <option value="">{t("All Years", "Všechny roky")}</option>
              {releaseYears().map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          {/* Minimum Rating */}
          <div>
            <label htmlFor="filter-rating-select" className={LABEL_CLASS}>
              {t("Min. Rating", "Min. hodnocení")}
            </label>
            <select
              id="filter-rating-select"
              value={filters.minRating}
              onChange={(e) => applyFilters({ minRating: e.target.value })}
              className={SELECT_CLASS}
            >
              <option value="">{t("Any Rating", "Jakékoli hodnocení")}</option>
              {MIN_RATING_OPTIONS.map((rating) => (
                <option key={rating} value={rating}>
                  {rating}+ ⭐
                </option>
              ))}
            </select>
          </div>

          {/* Original language */}
          <div>
            <label htmlFor="filter-language-select" className={LABEL_CLASS}>
              {t("Original Language", "Původní jazyk")}
            </label>
            <select
              id="filter-language-select"
              value={filters.language}
              onChange={(e) => applyFilters({ language: e.target.value })}
              className={SELECT_CLASS}
            >
              <option value="">{t("All Languages", "Všechny jazyky")}</option>
              {LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {languageOptionLabel(language, locale)}
                </option>
              ))}
            </select>
          </div>

          {/* Genre */}
          <div>
            <label htmlFor="filter-genre-select" className={LABEL_CLASS}>
              {genreLabel}
            </label>
            <select
              id="filter-genre-select"
              value={filters.genre}
              onChange={(e) => applyFilters({ genre: e.target.value })}
              className={SELECT_CLASS}
            >
              <option value="">{genreAllLabel}</option>
              {genres.map((genre) => (
                <option key={genre.id} value={genre.id}>
                  {genreName(genre, locale)}
                </option>
              ))}
            </select>
          </div>

          {/* Streaming platform – either the ones saved in the profile, or any
              single platform available in the region. */}
          <div>
            <label htmlFor="filter-provider-select" className={LABEL_CLASS}>
              {t("Streaming Platform", "Streamovací služba")}
            </label>
            <select
              id="filter-provider-select"
              value={filters.provider}
              onChange={(e) => applyFilters({ provider: e.target.value })}
              className={SELECT_CLASS}
            >
              <option value="">
                {t("Use profile setting", "Podle nastavení profilu")}
              </option>
              <option value={ANY_PROVIDERS}>
                {t("Any Platform", "Jakákoli služba")}
              </option>
              {showMyProvidersOption && (
                <option value={MY_PROVIDERS}>{myProvidersLabel}</option>
              )}
              {isUnlistedProvider && (
                <option value={filters.provider}>
                  {isLoadingProviders
                    ? t("Loading platforms…", "Načítáme služby…")
                    : `${t("Platform", "Služba")} #${filters.provider}`}
                </option>
              )}
              {myProviders.length > 0 && (
                <optgroup label={t("My platforms", "Moje služby")}>
                  {myProviders.map((provider) => (
                    <option
                      key={provider.provider_id}
                      value={provider.provider_id}
                    >
                      {provider.provider_name}
                    </option>
                  ))}
                </optgroup>
              )}
              {otherProviders.length > 0 && (
                <optgroup
                  label={
                    myProviders.length > 0
                      ? t("All other platforms", "Všechny ostatní služby")
                      : t("All platforms", "Všechny služby")
                  }
                >
                  {otherProviders.map((provider) => (
                    <option
                      key={provider.provider_id}
                      value={provider.provider_id}
                    >
                      {provider.provider_name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>
      </fieldset>

      {/* Active filters + result count */}
      <div className="mt-4 pt-4 border-t border-gray-700 flex flex-wrap items-center gap-2">
        {hasFilters ? (
          <>
            <span className="text-sm text-gray-400" id="active-filters-label">
              {t("Active filters:", "Aktivní filtry:")}
            </span>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-labelledby="active-filters-label"
            >
              {activeChips.map((chip) => (
                <button
                  key={chip.key}
                  onClick={() => applyFilters(chip.patch)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900"
                  aria-label={`${t("Remove filter", "Odebrat filtr")} ${chip.label}`}
                >
                  {chip.label} ✕
                </button>
              ))}
            </div>
            <button
              onClick={clearFilters}
              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900"
              aria-label={t(
                "Clear all active filters",
                "Zrušit všechny aktivní filtry",
              )}
            >
              {t("Clear Filters", "Zrušit filtry")}
            </button>
          </>
        ) : (
          emptyHint && <span className="text-sm text-gray-400">{emptyHint}</span>
        )}

        {/* Kept mounted through a pending load – there is no count to show
            then – because a live region only announces changes to content it
            already held, not its own arrival. */}
        {(totalResults !== undefined || resultsPending) && (
          <span className="ml-auto text-sm text-gray-400" aria-live="polite">
            {isPending || resultsPending || totalResults === undefined
              ? t("Updating results…", "Aktualizujeme výsledky…")
              : formatResultCount(totalResults, type, locale)}
          </span>
        )}
      </div>
    </div>
  );
}
