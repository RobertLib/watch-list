"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "@/i18n/Link";
import { Star, Tv, Film, ChevronDown } from "lucide-react";
import { getImageUrl } from "@/lib/tmdb-image";
import { releaseYear } from "@/lib/dates";
import { createSlug } from "@/lib/utils";
import { creditRoleLabel, type PersonMovieWork, type PersonTVWork } from "@/lib/person-credits";
import { movieHref, tvHref } from "@/lib/routes";
import { useLocalDay } from "@/hooks/useLocalDay";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { formatCount, pluralForm, type PluralForms, formatRating } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";

interface PersonFilmographyProps {
  movieCredits: PersonMovieWork[];
  tvCredits: PersonTVWork[];
}

type Tab = "all" | "movies" | "tv";
type SortKey = "year" | "rating" | "popularity";

// Zero rather than null: this only feeds the sort comparator, where an undated
// credit sorting to the bottom is exactly what is wanted.
function getYear(date: string | null | undefined): number {
  return releaseYear(date) ?? 0;
}

const INITIAL_SHOW = 10;

const MOVIES: PluralForms = {
  en: ["movie", "movies"],
  cs: ["film", "filmy", "filmů"],
};
const TV_SHOWS: PluralForms = {
  en: ["TV show", "TV shows"],
  cs: ["seriál", "seriály", "seriálů"],
};
const EPISODES: PluralForms = {
  en: ["ep.", "ep."],
  cs: ["epizoda", "epizody", "epizod"],
};

/**
 * "Zobrazit všech 24 filmů" – Czech agrees "all" with the count as well as the
 * noun ("všechny 3 filmy"). English keeps the sentence it has always had.
 */
function showAllLabel(
  count: number,
  english: string,
  forms: PluralForms,
  locale: Locale,
): string {
  if (locale !== "cs") return english;
  const all = pluralForm(count, locale, {
    en: ["", "all "],
    cs: ["", "všechny ", "všech "],
  });
  return `Zobrazit ${all}${formatCount(count, locale, forms)}`;
}

export function PersonFilmography({
  movieCredits,
  tvCredits,
}: PersonFilmographyProps) {
  const [tab, setTab] = useState<Tab>("all");
  const [sort, setSort] = useState<SortKey>("year");
  const [showAllMovies, setShowAllMovies] = useState(false);
  const [showAllTV, setShowAllTV] = useState(false);
  const today = useLocalDay();
  const locale = useLocale();
  const t = useT();

  const movies = [...movieCredits].sort((a, b) => {
    if (sort === "year")
      return getYear(b.release_date) - getYear(a.release_date);
    if (sort === "rating") return b.vote_average - a.vote_average;
    return b.popularity - a.popularity;
  });

  const tvShows = [...tvCredits].sort((a, b) => {
    if (sort === "year")
      return getYear(b.first_air_date) - getYear(a.first_air_date);
    if (sort === "rating") return b.vote_average - a.vote_average;
    return b.popularity - a.popularity;
  });

  const currentYear = releaseYear(today);

  const visibleMovies = showAllMovies ? movies : movies.slice(0, INITIAL_SHOW);
  const visibleTV = showAllTV ? tvShows : tvShows.slice(0, INITIAL_SHOW);

  const showMovies = tab === "all" || tab === "movies";
  const showTV = tab === "all" || tab === "tv";

  return (
    <section>
      {/* Header row: media filters and sort */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h2 className="text-xl font-bold">{t("Filmography", "Filmografie")}</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Media filter buttons */}
          <div
            className="flex rounded-lg overflow-hidden border border-gray-700 text-sm"
            role="group"
            aria-label={t("Filter filmography by media type", "Filtrovat filmografii podle typu")}
          >
            {(
              [
                { key: "all", label: t("All", "Vše") },
                { key: "movies", label: `${t("Movies", "Filmy")} (${movies.length})` },
                { key: "tv", label: `${t("TV", "Seriály")} (${tvShows.length})` },
              ] as { key: Tab; label: string }[]
            ).map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={tab === option.key}
                onClick={() => setTab(option.key)}
                className={`px-3 py-1.5 transition-colors ${
                  tab === option.key
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {/* Sort */}
          <select
            aria-label={t("Sort filmography", "Řadit filmografii")}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
          >
            <option value="year">{t("By Year", "Podle roku")}</option>
            <option value="rating">{t("By Rating", "Podle hodnocení")}</option>
            <option value="popularity">
              {t("By Popularity", "Podle popularity")}
            </option>
          </select>
        </div>
      </div>

      {/* Movies list */}
      {showMovies && movies.length > 0 && (
        <div className="mb-8">
          {tab === "all" && (
            <h3 className="flex items-center gap-2 text-base font-semibold text-gray-300 mb-3">
              <Film className="w-4 h-4" /> {t("Movies", "Filmy")}
            </h3>
          )}
          <div className="space-y-2">
            {visibleMovies.map((movie) => {
              const year = getYear(movie.release_date);
              const isCurrent = year === currentYear;
              const isUpcoming =
                today && movie.release_date && movie.release_date > today;
              const roleLabel = creditRoleLabel(movie, locale);
              return (
                <Link
                  key={movie.id}
                  href={movieHref(createSlug(movie.title, movie.id))}
                  prefetch={false}
                  className="group flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  {/* Poster thumbnail – 40px wide, so w92 covers it at 2x.
                      A long filmography is a hundred of these. */}
                  <div className="relative w-10 h-15 shrink-0 overflow-hidden rounded">
                    <Image
                      src={getImageUrl(movie.poster_path, "w92")}
                      alt={movie.title}
                      fill
                      className="object-cover"
                      loading="lazy"
                    />
                  </div>
                  {/* Year */}
                  <span className="w-12 shrink-0 text-sm text-gray-500 text-right">
                    {isUpcoming ? (
                      <span className="text-blue-400 text-xs font-medium">
                        {t("Soon", "Brzy")}
                      </span>
                    ) : isCurrent ? (
                      <span className="text-green-400 text-xs font-medium">
                        {year}
                      </span>
                    ) : (
                      year || "—"
                    )}
                  </span>
                  {/* Title + character */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium group-hover:text-blue-400 transition-colors leading-tight truncate">
                      {movie.title}
                    </p>
                    {roleLabel && (
                      <p className="text-gray-500 text-xs truncate">
                        {roleLabel}
                      </p>
                    )}
                  </div>
                  {/* Rating */}
                  {movie.vote_average > 0 && (
                    <span className="flex items-center gap-1 text-xs text-yellow-400 shrink-0">
                      <Star className="w-3 h-3 fill-yellow-400" />
                      {formatRating(movie.vote_average, locale)}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
          {movies.length > INITIAL_SHOW && (
            <button
              onClick={() => setShowAllMovies(!showAllMovies)}
              className="mt-3 flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm transition-colors"
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform ${showAllMovies ? "rotate-180" : ""}`}
              />
              {showAllMovies
                ? t("Show fewer movies", "Zobrazit méně filmů")
                : showAllLabel(
                    movies.length,
                    `Show all ${movies.length} movies`,
                    MOVIES,
                    locale,
                  )}
            </button>
          )}
        </div>
      )}

      {/* TV list */}
      {showTV && tvShows.length > 0 && (
        <div>
          {tab === "all" && (
            <h3 className="flex items-center gap-2 text-base font-semibold text-gray-300 mb-3">
              <Tv className="w-4 h-4" /> {t("TV Shows", "Seriály")}
            </h3>
          )}
          <div className="space-y-2">
            {visibleTV.map((show) => {
              const year = getYear(show.first_air_date);
              const isCurrent = year === currentYear;
              const roleLabel = creditRoleLabel(show, locale);
              return (
                <Link
                  key={show.id}
                  href={tvHref(createSlug(show.name, show.id))}
                  prefetch={false}
                  className="group flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  {/* Poster thumbnail */}
                  <div className="relative w-10 h-15 shrink-0 overflow-hidden rounded">
                    <Image
                      src={getImageUrl(show.poster_path, "w92")}
                      alt={show.name}
                      fill
                      className="object-cover"
                      loading="lazy"
                    />
                  </div>
                  {/* Year */}
                  <span className="w-12 shrink-0 text-sm text-gray-500 text-right">
                    {isCurrent ? (
                      <span className="text-green-400 text-xs font-medium">
                        {year}
                      </span>
                    ) : (
                      year || "—"
                    )}
                  </span>
                  {/* Title + character + episodes */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium group-hover:text-blue-400 transition-colors leading-tight truncate">
                      {show.name}
                    </p>
                    <p className="text-gray-500 text-xs truncate">
                      {roleLabel}
                      {roleLabel && show.episode_count ? " · " : ""}
                      {show.episode_count
                        ? locale === "cs"
                          ? formatCount(show.episode_count, locale, EPISODES)
                          : `${show.episode_count} ep.`
                        : ""}
                    </p>
                  </div>
                  {/* Rating */}
                  {show.vote_average > 0 && (
                    <span className="flex items-center gap-1 text-xs text-yellow-400 shrink-0">
                      <Star className="w-3 h-3 fill-yellow-400" />
                      {formatRating(show.vote_average, locale)}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
          {tvShows.length > INITIAL_SHOW && (
            <button
              onClick={() => setShowAllTV(!showAllTV)}
              className="mt-3 flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm transition-colors"
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform ${showAllTV ? "rotate-180" : ""}`}
              />
              {showAllTV
                ? t("Show fewer TV shows", "Zobrazit méně seriálů")
                : showAllLabel(
                    tvShows.length,
                    `Show all ${tvShows.length} TV shows`,
                    TV_SHOWS,
                    locale,
                  )}
            </button>
          )}
        </div>
      )}

      {movies.length === 0 && tvShows.length === 0 && (
        <p className="text-gray-400 py-8 text-center">
          {t("No credits available.", "Filmografie zatím není k dispozici.")}
        </p>
      )}
    </section>
  );
}
