import Link from "next/link";
import type { Genre, MediaType } from "@/types/tmdb";
import { genreHref } from "@/lib/routes";
import { MOVIE_GENRES, TV_GENRES, genreSlug } from "@/lib/genre-catalog";

function GenreCard({ genre, type }: { genre: Genre; type: MediaType }) {
  return (
    <Link
      href={genreHref(type, genreSlug(genre))}
      prefetch={false}
      className="group block p-6 bg-gray-800 rounded-lg border border-gray-700 hover:border-blue-500 hover:bg-gray-700 transition-all duration-300"
    >
      <div className="text-center">
        <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors">
          {genre.name}
        </h3>
        <p className="text-sm text-gray-400 mt-2 capitalize">
          {type === "movie" ? "Movies" : "TV Shows"}
        </p>
      </div>
    </Link>
  );
}

function GenresSection({
  title,
  genres,
  type,
}: {
  title: string;
  genres: readonly Genre[];
  type: MediaType;
}) {
  return (
    <section className="mb-12">
      <h2 className="text-2xl font-bold text-white mb-6">{title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {genres.map((genre) => (
          <GenreCard key={`${type}-${genre.id}`} genre={genre} type={type} />
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
 */
export function GenresContent() {
  return (
    <>
      <GenresSection title="Movie Genres" genres={MOVIE_GENRES} type="movie" />
      <GenresSection title="TV Show Genres" genres={TV_GENRES} type="tv" />
    </>
  );
}
