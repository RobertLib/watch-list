import { Suspense } from "react";
import Image from "next/image";
import { tmdbApi } from "@/lib/tmdb";
import { getRegion } from "@/lib/region-server";
import { getRegionCode } from "@/lib/region";
import { WatchProvidersResponse } from "@/types/tmdb";

interface TVWatchProvidersProps {
  tvId?: number;
  watchProviders?: WatchProvidersResponse;
}

async function TVWatchProvidersContent({
  tvId,
  watchProviders: providedWatchProviders,
}: TVWatchProvidersProps) {
  let watchProviders = providedWatchProviders;

  // Fallback to API call if not provided in details
  if (!watchProviders && tvId) {
    watchProviders = await tmdbApi.getTVWatchProviders(tvId);
  }

  if (!watchProviders) {
    return null;
  }

  const currentRegion = await getRegion();
  const regionCode = getRegionCode(currentRegion);
  const providers = watchProviders.results[regionCode];

  if (!providers) {
    return null;
  }

  return (
    <div className="bg-gray-900 rounded-lg p-6 shadow border border-gray-800">
      <h3 className="text-xl font-bold mb-4 text-white">Where to Watch</h3>
      <div className="space-y-4">
        {providers.flatrate && (
          <div>
            <h4 className="font-semibold text-gray-300 mb-2">Streaming</h4>
            <div className="flex flex-wrap gap-2">
              {providers.flatrate.map((provider) => (
                <div
                  key={provider.provider_id}
                  className="flex items-center gap-2 bg-gray-800 rounded-lg p-2"
                >
                  <Image
                    src={tmdbApi.getImageUrl(provider.logo_path, "w500")}
                    alt={provider.provider_name}
                    width={24}
                    height={24}
                    className="rounded"
                  />
                  <span className="text-sm text-white">
                    {provider.provider_name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {providers.rent && (
          <div>
            <h4 className="font-semibold text-gray-300 mb-2">Rent</h4>
            <div className="flex flex-wrap gap-2">
              {providers.rent.map((provider) => (
                <div
                  key={provider.provider_id}
                  className="flex items-center gap-2 bg-gray-800 rounded-lg p-2"
                >
                  <Image
                    src={tmdbApi.getImageUrl(provider.logo_path, "w500")}
                    alt={provider.provider_name}
                    width={24}
                    height={24}
                    className="rounded"
                  />
                  <span className="text-sm text-white">
                    {provider.provider_name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {providers.buy && (
          <div>
            <h4 className="font-semibold text-gray-300 mb-2">Buy</h4>
            <div className="flex flex-wrap gap-2">
              {providers.buy.map((provider) => (
                <div
                  key={provider.provider_id}
                  className="flex items-center gap-2 bg-gray-800 rounded-lg p-2"
                >
                  <Image
                    src={tmdbApi.getImageUrl(provider.logo_path, "w500")}
                    alt={provider.provider_name}
                    width={24}
                    height={24}
                    className="rounded"
                  />
                  <span className="text-sm text-white">
                    {provider.provider_name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingWatchProviders() {
  return (
    <div className="bg-gray-900 rounded-lg p-6 shadow border border-gray-800 animate-pulse">
      <div className="h-6 bg-gray-700 rounded mb-4 w-1/2"></div>
      <div className="space-y-4">
        <div className="h-4 bg-gray-700 rounded w-1/3"></div>
        <div className="flex gap-2">
          <div className="w-8 h-8 bg-gray-700 rounded"></div>
          <div className="w-8 h-8 bg-gray-700 rounded"></div>
          <div className="w-8 h-8 bg-gray-700 rounded"></div>
        </div>
      </div>
    </div>
  );
}

export function TVWatchProviders({
  tvId,
  watchProviders,
}: TVWatchProvidersProps) {
  return (
    <Suspense fallback={<LoadingWatchProviders />}>
      <TVWatchProvidersContent tvId={tvId} watchProviders={watchProviders} />
    </Suspense>
  );
}
