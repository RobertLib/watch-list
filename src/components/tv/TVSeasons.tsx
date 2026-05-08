import Image from "next/image";
import { tmdbApi } from "@/lib/tmdb";
import type { Season } from "@/types/tmdb";

interface TVSeasonsProps {
  seasons: Season[];
}

export function TVSeasons({ seasons }: TVSeasonsProps) {
  // Filter out season 0 (specials) — show it last if present
  const regularSeasons = seasons.filter((s) => s.season_number > 0);
  const specials = seasons.filter((s) => s.season_number === 0);
  const sorted = [...regularSeasons, ...specials];

  if (sorted.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="text-2xl font-bold mb-4 text-white">Seasons</h2>
      <div className="space-y-3">
        {sorted.map((season) => (
          <div
            key={season.id}
            className="flex gap-4 bg-gray-800 rounded-lg p-3 hover:bg-gray-750 transition-colors"
          >
            <div className="relative w-14 h-20 shrink-0 rounded overflow-hidden">
              {season.poster_path ? (
                <Image
                  src={tmdbApi.getImageUrl(season.poster_path, "w500")}
                  alt={season.name}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                  <span className="text-gray-500 text-xs text-center px-1">
                    No image
                  </span>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-white">{season.name}</h3>
                {season.vote_average > 0 && (
                  <span className="text-yellow-400 text-sm">
                    ★ {season.vote_average.toFixed(1)}
                  </span>
                )}
              </div>
              <p className="text-gray-400 text-sm mt-0.5">
                {season.episode_count} episode
                {season.episode_count !== 1 ? "s" : ""}
                {season.air_date && (
                  <> · {new Date(season.air_date).getFullYear()}</>
                )}
              </p>
              {season.overview && (
                <p className="text-gray-300 text-sm mt-1 line-clamp-2">
                  {season.overview}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
