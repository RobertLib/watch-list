import { Suspense } from "react";
import Link from "next/link";
import { tmdbApi } from "@/lib/tmdb";
import { Genre } from "@/types/tmdb";
import { createSlug } from "@/lib/utils";

interface GenreCardProps {
  genre: Genre;
  type: "movie" | "tv";
}

function GenreCard({ genre, type }: GenreCardProps) {
  const href = `/genres/${type}/${createSlug(genre.name, genre.id)}`;

  return (
    <Link
      href={href}
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

interface GenresSectionProps {
  title: string;
  genres: Genre[];
  type: "movie" | "tv";
}

function GenresSection({ title, genres, type }: GenresSectionProps) {
  return (
    <section className="mb-12">
      <h2 className="text-2xl font-bold text-white mb-6">{title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {genres.map((genre) => (
          <GenreCard key={`${type}-${genre.id}`} genre={genre} type={type} />
        ))}
      </div>
      {genres.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-400">No genres found.</p>
        </div>
      )}
    </section>
  );
}

async function GenresDataWrapper() {
  const [movieGenres, tvGenres] = await Promise.all([
    tmdbApi.getMovieGenres(),
    tmdbApi.getTVGenres(),
  ]);

  return (
    <>
      <GenresSection
        title="Movie Genres"
        genres={movieGenres.genres}
        type="movie"
      />
      <GenresSection
        title="TV Show Genres"
        genres={tvGenres.genres}
        type="tv"
      />
    </>
  );
}

function GenresLoadingFallback() {
  return (
    <>
      <section className="mb-12">
        <h2 className="text-2xl font-bold text-white mb-6">Movie Genres</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="p-6 bg-gray-800 rounded-lg border border-gray-700">
                <div className="text-center">
                  <div className="h-5 bg-gray-700 rounded mb-2"></div>
                  <div className="h-4 bg-gray-700 rounded w-1/2 mx-auto"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold text-white mb-6">TV Show Genres</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="p-6 bg-gray-800 rounded-lg border border-gray-700">
                <div className="text-center">
                  <div className="h-5 bg-gray-700 rounded mb-2"></div>
                  <div className="h-4 bg-gray-700 rounded w-1/2 mx-auto"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export function GenresContent() {
  return (
    <Suspense fallback={<GenresLoadingFallback />}>
      <GenresDataWrapper />
    </Suspense>
  );
}
