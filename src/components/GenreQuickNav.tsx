import Link from "next/link";
import { genreHref } from "@/lib/routes";
import { findGenreById, genreSlug } from "@/lib/genre-catalog";
import type { Genre, MediaType } from "@/types/tmdb";

// Most-popular genres to show (movie IDs)
const FEATURED_MOVIE_GENRE_IDS = [28, 35, 18, 27, 878, 53, 80, 10749];
// Most-popular genres to show (TV IDs)
const FEATURED_TV_GENRE_IDS = [18, 35, 10759, 80, 10765, 9648];

function featured(mediaType: MediaType, ids: number[]): Genre[] {
  return ids
    .map((id) => findGenreById(mediaType, id))
    .filter((g): g is Genre => g !== undefined);
}

interface GenreChipProps {
  genre: Genre;
  type: MediaType;
}

function GenreChip({ genre, type }: GenreChipProps) {
  const href = genreHref(type, genreSlug(genre));

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
 * Read from `genre-catalog.ts`, so the row is in the home page's prerendered
 * HTML – links a crawler follows into the genre pages – instead of appearing
 * once a request for the genre lists has answered.
 */
export function GenreQuickNav() {
  const featuredMovieGenres = featured("movie", FEATURED_MOVIE_GENRE_IDS);
  const featuredTVGenres = featured("tv", FEATURED_TV_GENRE_IDS);

  return (
    <section aria-labelledby="genres-nav-heading">
      <div className="flex items-center justify-between mb-4">
        <h2 id="genres-nav-heading" className="text-xl font-bold text-white">
          Browse by Genre
        </h2>
        <Link
          href="/genres"
          prefetch={false}
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
