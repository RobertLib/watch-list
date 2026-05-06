import Image from "next/image";
import Link from "next/link";
import { tmdbApi } from "@/lib/tmdb";
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {similar.results.slice(0, 9).map((show, index) => {
          const slug = createSlug(show.name, show.id);
          return (
            <Link
              key={show.id}
              href={`/tv/${slug}`}
              prefetch={false}
              rel="nofollow"
              className="flex gap-3 group"
            >
              <div className="relative w-16 shrink-0 aspect-2/3">
                <Image
                  src={tmdbApi.getImageUrl(show.poster_path, "w500")}
                  alt={show.name}
                  fill
                  className="object-cover rounded group-hover:opacity-80 transition-opacity"
                  loading={index < 3 ? "eager" : "lazy"}
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-white group-hover:text-blue-400 transition-colors">
                  {show.name}
                </h3>
                <p className="text-gray-400 text-xs mb-1">
                  {new Date(show.first_air_date).getFullYear() || "Unknown"}
                </p>
                {show.overview && (
                  <p className="text-gray-300 text-xs line-clamp-3 leading-relaxed">
                    {show.overview}
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

export function SimilarTVShows({ similar }: SimilarTVShowsProps) {
  return <SimilarTVShowsContent similar={similar} />;
}
