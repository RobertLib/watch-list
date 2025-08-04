"use client";

import Image from "next/image";
import { tmdbApi } from "@/lib/tmdb";
import { WatchProvider } from "@/types/tmdb";
import { cn } from "@/lib/utils";

interface WatchProvidersProps {
  providers: WatchProvider[];
  loading?: boolean;
  className?: string;
}

export function WatchProviders({
  providers,
  loading = false,
  className,
}: WatchProvidersProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {loading ? (
        <>
          <span className="text-xs text-gray-400">Loading providers...</span>
          <div className="flex gap-1">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="w-6 h-6 rounded bg-gray-600 animate-pulse"
              />
            ))}
          </div>
        </>
      ) : providers.length > 0 ? (
        <>
          <span className="text-xs text-gray-400">Available on:</span>
          <div className="flex gap-1">
            {providers.slice(0, 3).map((provider) => (
              <div
                key={provider.provider_id}
                className="w-6 h-6 rounded overflow-hidden"
                title={provider.provider_name}
              >
                <Image
                  src={tmdbApi.getImageUrl(provider.logo_path, "w500")}
                  alt={provider.provider_name}
                  width={24}
                  height={24}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
            {providers.length > 3 && (
              <div className="w-6 h-6 rounded bg-gray-600 flex items-center justify-center">
                <span className="text-xs text-white">
                  +{providers.length - 3}
                </span>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
