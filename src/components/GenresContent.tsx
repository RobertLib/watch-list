import Link from "@/i18n/Link";
import type { Genre, MediaType } from "@/types/tmdb";
import { genreHref } from "@/lib/routes";
import {
  MOVIE_GENRES,
  TV_GENRES,
  genreName,
  genreSlug,
} from "@/lib/genre-catalog";
import { t, type Locale } from "@/i18n/locale";

function GenreCard({
  genre,
  type,
  locale,
}: {
  genre: Genre;
  type: MediaType;
  locale: Locale;
}) {
  return (
    <Link
      href={genreHref(type, genreSlug(genre))}
      prefetch={false}
      className="group block p-6 bg-gray-800 rounded-lg border border-gray-700 hover:border-blue-500 hover:bg-gray-700 transition-all duration-300"
    >
      <div className="text-center">
        <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors">
          {genreName(genre, locale)}
        </h3>
        <p className="text-sm text-gray-400 mt-2 capitalize">
          {type === "movie"
            ? t(locale, "Movies", "Filmy")
            : t(locale, "TV Shows", "Seriály")}
        </p>
      </div>
    </Link>
  );
}

function GenresSection({
  title,
  genres,
  type,
  locale,
}: {
  title: string;
  genres: readonly Genre[];
  type: MediaType;
  locale: Locale;
}) {
  return (
    <section className="mb-12">
      <h2 className="text-2xl font-bold text-white mb-6">{title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {genres.map((genre) => (
          <GenreCard
            key={`${type}-${genre.id}`}
            genre={genre}
            type={type}
            locale={locale}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * Every genre TMDB knows, in two grids.
 *
 * From `genre-catalog.ts` rather than from TMDB: every genre page is a path the
 * build emits from that same list, so it is exactly the set of links that
 * resolve – and being in the code is what puts all of them in the prerendered
 * HTML of `/genres`, the page a crawler finds them through.
 *
 * A Server Component, so the page says which language it is in: `locale`.
 */
export function GenresContent({ locale = "en" }: { locale?: Locale }) {
  return (
    <>
      <GenresSection
        title={t(locale, "Movie Genres", "Filmové žánry")}
        genres={MOVIE_GENRES}
        type="movie"
        locale={locale}
      />
      <GenresSection
        title={t(locale, "TV Show Genres", "Seriálové žánry")}
        genres={TV_GENRES}
        type="tv"
        locale={locale}
      />
    </>
  );
}
