import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { tmdbApi } from "@/lib/tmdb";
import { LoadingCard } from "@/components/LoadingSpinner";
import { createSlug } from "@/lib/utils";
import type { TMDBResponse, Movie } from "@/types/tmdb";

interface SimilarMoviesProps {
  similar: TMDBResponse<Movie>;
}

function SimilarMoviesContent({ similar }: SimilarMoviesProps) {
  if (similar.results.length === 0) {
    return null;
  }

  return (
    <section>
      <h2 className="text-2xl font-bold mb-6">Similar Movies</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {similar.results.slice(0, 12).map((movie) => {
          const slug = createSlug(movie.title, movie.id);
          return (
            <Link
              key={movie.id}
              href={`/movie/${slug}`}
              prefetch={false}
              className="block"
            >
              <div className="relative aspect-2/3 mb-3">
                <Image
                  src={tmdbApi.getImageUrl(movie.poster_path, "w500")}
                  alt={movie.title}
                  fill
                  className="object-cover rounded-lg hover:scale-105 transition-transform"
                />
              </div>
              <h3 className="font-semibold text-sm line-clamp-2 text-white">
                {movie.title}
              </h3>
              <p className="text-gray-300 text-sm">
                {new Date(movie.release_date).getFullYear() || "N/A"}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function LoadingSimilarMovies() {
  return (
    <section>
      <h2 className="text-2xl font-bold mb-6">Similar Movies</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <LoadingCard key={i} />
        ))}
      </div>
    </section>
  );
}

export function SimilarMovies({ similar }: SimilarMoviesProps) {
  return (
    <Suspense fallback={<LoadingSimilarMovies />}>
      <SimilarMoviesContent similar={similar} />
    </Suspense>
  );
}
