import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { tmdbApi } from "@/lib/tmdb";
import { LoadingCard } from "@/components/LoadingSpinner";
import { createSlug } from "@/lib/utils";
import type { TMDBResponse, TVShow } from "@/types/tmdb";

interface SimilarTVShowsProps {
  similar: TMDBResponse<TVShow>;
}

function SimilarTVShowsContent({ similar }: SimilarTVShowsProps) {
  if (similar.results.length === 0) {
    return null;
  }

  return (
    <section>
      <h2 className="text-2xl font-bold mb-6">Similar TV Shows</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {similar.results.slice(0, 12).map((show) => {
          const slug = createSlug(show.name, show.id);
          return (
            <Link
              key={show.id}
              href={`/tv/${slug}`}
              prefetch={false}
              className="block"
            >
              <div className="relative aspect-2/3 mb-3">
                <Image
                  src={tmdbApi.getImageUrl(show.poster_path, "w500")}
                  alt={show.name}
                  fill
                  className="object-cover rounded-lg hover:scale-105 transition-transform"
                />
              </div>
              <h3 className="font-semibold text-sm line-clamp-2 text-white">
                {show.name}
              </h3>
              <p className="text-gray-300 text-sm">
                {new Date(show.first_air_date).getFullYear() || "Unknown"}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function LoadingSimilarTVShows() {
  return (
    <section>
      <h2 className="text-2xl font-bold mb-6">Similar TV Shows</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <LoadingCard key={i} />
        ))}
      </div>
    </section>
  );
}

export function SimilarTVShows({ similar }: SimilarTVShowsProps) {
  return (
    <Suspense fallback={<LoadingSimilarTVShows />}>
      <SimilarTVShowsContent similar={similar} />
    </Suspense>
  );
}
