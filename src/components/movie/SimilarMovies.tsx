import Image from "next/image";
import Link from "next/link";
import { tmdbApi } from "@/lib/tmdb";
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {similar.results.slice(0, 9).map((movie, index) => {
          const slug = createSlug(movie.title, movie.id);
          return (
            <Link
              key={movie.id}
              href={`/movie/${slug}`}
              prefetch={false}
              rel="nofollow"
              className="flex gap-3 group"
            >
              <div className="relative w-16 shrink-0 aspect-2/3">
                <Image
                  src={tmdbApi.getImageUrl(movie.poster_path, "w500")}
                  alt={movie.title}
                  fill
                  className="object-cover rounded group-hover:opacity-80 transition-opacity"
                  loading={index < 3 ? "eager" : "lazy"}
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-white group-hover:text-blue-400 transition-colors">
                  {movie.title}
                </h3>
                <p className="text-gray-400 text-xs mb-1">
                  {new Date(movie.release_date).getFullYear() || "N/A"}
                </p>
                {movie.overview && (
                  <p className="text-gray-300 text-xs line-clamp-3 leading-relaxed">
                    {movie.overview}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function SimilarMovies({ similar }: SimilarMoviesProps) {
  return <SimilarMoviesContent similar={similar} />;
}
