"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Star, Tv, Film, ChevronDown } from "lucide-react";
import { tmdbApi } from "@/lib/tmdb";
import { createSlug } from "@/lib/utils";
import type { PersonMovieCredit, PersonTVCredit } from "@/types/tmdb";

interface PersonFilmographyProps {
  movieCredits: PersonMovieCredit[];
  tvCredits: PersonTVCredit[];
}

type Tab = "all" | "movies" | "tv";
type SortKey = "year" | "rating" | "popularity";

function getYear(date: string | null | undefined): number {
  if (!date) return 0;
  const y = new Date(date).getFullYear();
  return isNaN(y) ? 0 : y;
}

const INITIAL_SHOW = 10;

export function PersonFilmography({
  movieCredits,
  tvCredits,
}: PersonFilmographyProps) {
  const [tab, setTab] = useState<Tab>("all");
  const [sort, setSort] = useState<SortKey>("year");
  const [showAllMovies, setShowAllMovies] = useState(false);
  const [showAllTV, setShowAllTV] = useState(false);

  // Deduplicate by id
  const movies = Array.from(
    new Map(movieCredits.map((m) => [m.id, m])).values(),
  ).sort((a, b) => {
    if (sort === "year")
      return getYear(b.release_date) - getYear(a.release_date);
    if (sort === "rating") return b.vote_average - a.vote_average;
    return b.popularity - a.popularity;
  });

  const tvShows = Array.from(
    new Map(tvCredits.map((t) => [t.id, t])).values(),
  ).sort((a, b) => {
    if (sort === "year")
      return getYear(b.first_air_date) - getYear(a.first_air_date);
    if (sort === "rating") return b.vote_average - a.vote_average;
    return b.popularity - a.popularity;
  });

  const currentYear = new Date().getFullYear();

  const visibleMovies = showAllMovies ? movies : movies.slice(0, INITIAL_SHOW);
  const visibleTV = showAllTV ? tvShows : tvShows.slice(0, INITIAL_SHOW);

  const showMovies = tab === "all" || tab === "movies";
  const showTV = tab === "all" || tab === "tv";

  return (
    <section>
      {/* Header row: tabs + sort */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h2 className="text-xl font-bold">Filmography</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Tab buttons */}
          <div className="flex rounded-lg overflow-hidden border border-gray-700 text-sm">
            {(
              [
                { key: "all", label: "All" },
                { key: "movies", label: `Movies (${movies.length})` },
                { key: "tv", label: `TV (${tvShows.length})` },
              ] as { key: Tab; label: string }[]
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 transition-colors ${
                  tab === t.key
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
          >
            <option value="year">By Year</option>
            <option value="rating">By Rating</option>
            <option value="popularity">By Popularity</option>
          </select>
        </div>
      </div>

      {/* Movies list */}
      {showMovies && movies.length > 0 && (
        <div className="mb-8">
          {tab === "all" && (
            <h3 className="flex items-center gap-2 text-base font-semibold text-gray-300 mb-3">
              <Film className="w-4 h-4" /> Movies
            </h3>
          )}
          <div className="space-y-2">
            {visibleMovies.map((movie) => {
              const year = getYear(movie.release_date);
              const isCurrent = year === currentYear;
              const isUpcoming =
                movie.release_date && new Date(movie.release_date) > new Date();
              return (
                <Link
                  key={movie.id}
                  href={`/movie/${createSlug(movie.title, movie.id)}`}
                  className="group flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  {/* Poster thumbnail */}
                  <div className="relative w-10 h-15 shrink-0 overflow-hidden rounded">
                    <Image
                      src={tmdbApi.getImageUrl(movie.poster_path, "w500")}
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
                        Soon
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
                    {movie.character && (
                      <p className="text-gray-500 text-xs truncate">
                        as {movie.character}
                      </p>
                    )}
                  </div>
                  {/* Rating */}
                  {movie.vote_average > 0 && (
                    <span className="flex items-center gap-1 text-xs text-yellow-400 shrink-0">
                      <Star className="w-3 h-3 fill-yellow-400" />
                      {movie.vote_average.toFixed(1)}
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
                ? "Show fewer movies"
                : `Show all ${movies.length} movies`}
            </button>
          )}
        </div>
      )}

      {/* TV list */}
      {showTV && tvShows.length > 0 && (
        <div>
          {tab === "all" && (
            <h3 className="flex items-center gap-2 text-base font-semibold text-gray-300 mb-3">
              <Tv className="w-4 h-4" /> TV Shows
            </h3>
          )}
          <div className="space-y-2">
            {visibleTV.map((show) => {
              const year = getYear(show.first_air_date);
              const isCurrent = year === currentYear;
              return (
                <Link
                  key={show.id}
                  href={`/tv/${createSlug(show.name, show.id)}`}
                  className="group flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  {/* Poster thumbnail */}
                  <div className="relative w-10 h-15 shrink-0 overflow-hidden rounded">
                    <Image
                      src={tmdbApi.getImageUrl(show.poster_path, "w500")}
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
                      {show.character ? `as ${show.character}` : ""}
                      {show.character && show.episode_count ? " · " : ""}
                      {show.episode_count ? `${show.episode_count} ep.` : ""}
                    </p>
                  </div>
                  {/* Rating */}
                  {show.vote_average > 0 && (
                    <span className="flex items-center gap-1 text-xs text-yellow-400 shrink-0">
                      <Star className="w-3 h-3 fill-yellow-400" />
                      {show.vote_average.toFixed(1)}
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
                ? "Show fewer TV shows"
                : `Show all ${tvShows.length} TV shows`}
            </button>
          )}
        </div>
      )}

      {movies.length === 0 && tvShows.length === 0 && (
        <p className="text-gray-400 py-8 text-center">No credits available.</p>
      )}
    </section>
  );
}
