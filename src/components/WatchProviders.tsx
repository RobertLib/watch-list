"use client";

import Image from "next/image";
import { getImageUrl } from "@/lib/tmdb-image";
import { WatchProvider } from "@/types/tmdb";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/LocaleProvider";

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
  const t = useT();
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {loading ? (
        <>
          <span className="text-xs text-gray-400">
            {t("Loading providers...", "Načítání služeb…")}
          </span>
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
          <span className="text-xs text-gray-400">
            {t("Available on:", "Dostupné na:")}
          </span>
          <div className="flex gap-1">
            {providers.slice(0, 3).map((provider) => (
              <div
                key={provider.provider_id}
                className="w-6 h-6 rounded overflow-hidden"
                title={provider.provider_name}
              >
                {/* 24px on every card: w92 covers it at 2x and 3x, where w45
                    would blur. The w500 this used to name is thirty times the
                    pixels, fetched for up to three logos on every card. */}
                <Image
                  src={getImageUrl(provider.logo_path, "w92")}
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
