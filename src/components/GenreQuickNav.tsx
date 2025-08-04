"use client";

import Link from "next/link";
import { useGenres } from "@/contexts/GenresContext";
import { genreHref } from "@/lib/routes";
import { createSlug } from "@/lib/utils";
import type { Genre } from "@/types/tmdb";

// Most-popular genres to show (movie IDs)
const FEATURED_MOVIE_GENRE_IDS = [28, 35, 18, 27, 878, 53, 80, 10749];
// Most-popular genres to show (TV IDs)
const FEATURED_TV_GENRE_IDS = [18, 35, 10759, 80, 10765, 9648];

interface GenreChipProps {
  genre: Genre;
  type: "movie" | "tv";
}

function GenreChip({ genre, type }: GenreChipProps) {
  const href = genreHref(type, createSlug(genre.name, genre.id));

  return (
    <Link
      href={href}
      prefetch={false}
      className="group px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 hover:border-gray-500 hover:bg-gray-700 transition-all duration-200 text-sm font-medium text-gray-300 hover:text-white"
    >
      {genre.name}
    </Link>
  );
}

/**
 * A shortcut row of the genres people actually browse.
 *
 * Reads the genre lists out of the context the layout already loads them into,
 * rather than fetching them again – they are the one thing on the home page that
 * every other page needs too.
 */
export function GenreQuickNav() {
  const { movieGenres, tvGenres, loading } = useGenres();

  if (loading) return <GenreQuickNavSkeleton />;

  const featuredMovieGenres = FEATURED_MOVIE_GENRE_IDS.map((id) =>
    movieGenres.find((g) => g.id === id),
  ).filter((g): g is Genre => g !== undefined);

  const featuredTVGenres = FEATURED_TV_GENRE_IDS.map((id) =>
    tvGenres.find((g) => g.id === id),
  ).filter((g): g is Genre => g !== undefined);

  if (featuredMovieGenres.length === 0 && featuredTVGenres.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="genres-nav-heading">
      <div className="flex items-center justify-between mb-4">
        <h2 id="genres-nav-heading" className="text-xl font-bold text-white">
          Browse by Genre
        </h2>
        <Link
          href="/genres"
          className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          All genres →
        </Link>
      </div>

      <div className="space-y-4">
        {featuredMovieGenres.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-medium">
              Movies
            </p>
            <div className="flex flex-wrap gap-2">
              {featuredMovieGenres.map((genre) => (
                <GenreChip
                  key={`movie-${genre.id}`}
                  genre={genre}
                  type="movie"
                />
              ))}
            </div>
          </div>
        )}

        {featuredTVGenres.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-medium">
              TV Shows
            </p>
            <div className="flex flex-wrap gap-2">
              {featuredTVGenres.map((genre) => (
                <GenreChip key={`tv-${genre.id}`} genre={genre} type="tv" />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function GenreQuickNavSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-7 bg-gray-700 rounded w-40" />
        <div className="h-4 bg-gray-700 rounded w-24" />
      </div>
      <div className="space-y-4">
        <div>
          <div className="h-3 bg-gray-800 rounded w-16 mb-2" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-800 rounded-xl w-28" />
            ))}
          </div>
        </div>
        <div>
          <div className="h-3 bg-gray-800 rounded w-16 mb-2" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-800 rounded-xl w-28" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
