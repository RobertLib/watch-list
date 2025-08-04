"use client";

import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import { MediaItem } from "@/types/tmdb";
import { tmdbApi } from "@/lib/tmdb";
import { tmdbDiscoverApi } from "@/lib/tmdb-discover";
import { HeroButtons } from "./HeroButtons";
import { HeroSkeleton } from "@/components/skeletons";
import { LoadFailureNotice } from "@/components/LoadFailureNotice";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useSettingsKey } from "@/hooks/useSettings";
import { releaseYear } from "@/lib/dates";

interface HeroSectionContentProps {
  featuredItem: MediaItem;
}

function HeroSectionContent({ featuredItem }: HeroSectionContentProps) {
  const backdropUrl = tmdbApi.getImageUrl(
    featuredItem.backdrop_path,
    "original",
  );
  const year = releaseYear(featuredItem.release_date);

  // Get the correct title for both movies and TV shows
  const title =
    featuredItem.title ||
    ("name" in featuredItem
      ? (featuredItem as { name: string }).name
      : "Unknown Title");

  return (
    <div className="relative flex min-h-[50vh] sm:min-h-[60vh] lg:min-h-[70vh] w-full overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <Image
          src={backdropUrl}
          alt={`Featured backdrop for ${title}`}
          fill
          className="object-cover object-top"
          priority
        />
        <div className="absolute inset-0 bg-linear-to-r from-black/80 via-black/40 to-transparent" />
        <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div className="relative flex w-full items-center py-4 sm:py-6">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="max-w-2xl space-y-3 sm:space-y-4 lg:space-y-6">
            {/* Title */}
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-white leading-tight">
              {title}
            </h2>

            {/* Meta information */}
            <div className="flex items-center gap-2 sm:gap-4 text-sm sm:text-base text-gray-200">
              <div
                className="flex items-center gap-1"
                role="img"
                aria-label={`Rating: ${featuredItem.vote_average?.toFixed(
                  1,
                )} out of 10 stars`}
              >
                <Star
                  className="w-4 h-4 sm:w-5 sm:h-5 fill-yellow-400 text-yellow-400"
                  aria-hidden="true"
                />
                <span className="font-medium">
                  {featuredItem.vote_average?.toFixed(1)}
                </span>
              </div>
              <span aria-hidden="true">•</span>
              <span>{year}</span>
              <span aria-hidden="true">•</span>
              <span className="capitalize">{featuredItem.media_type}</span>
            </div>

            {/* Overview */}
            <p className="text-sm sm:text-base lg:text-lg text-gray-200 leading-relaxed line-clamp-2 sm:line-clamp-3 max-w-xl">
              {featuredItem.overview}
            </p>

            {/* Action Buttons */}
            <HeroButtons featuredItem={featuredItem} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The top of the home page: whatever is trending hardest this week.
 *
 * It fetches trending itself rather than being handed it by the page, which used
 * to matter because the same list also feeds the carousel below. It still costs
 * one request: both go through the same URL, and the TMDB cache hands the second
 * caller the first one's promise.
 */
export function HeroSection() {
  const settingsKey = useSettingsKey();
  const { data, isLoading, error, reload } = useAsyncData(
    () => tmdbDiscoverApi.getTrending("all", "week"),
    [settingsKey],
  );

  const featuredItem = data?.results[0] ?? null;

  if (isLoading) {
    return <HeroSkeleton gradientFrom="from-gray-900" />;
  }

  // The compact notice rather than the full-page one: the rows below the banner
  // fetch separately and may well have arrived, so this reports the banner's own
  // failure without claiming the page is empty. It is also the only visible sign
  // when TMDB is unreachable altogether – the carousels below leave themselves
  // out in silence.
  if (error) {
    return (
      <LoadFailureNotice
        title="Could not load what's trending"
        description="TMDB did not answer. Your watchlist and everything saved in this browser are unaffected."
        onRetry={reload}
        compact
      />
    );
  }

  if (!featuredItem) {
    return (
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 text-center">
        <h2 className="text-xl font-bold mb-2">No titles match your settings</h2>
        <p className="text-gray-400 max-w-md mx-auto">
          No movies or series were found for your region and streaming
          preferences. Review your settings to broaden the catalogue.
        </p>
        <Link
          href="/profile"
          prefetch={false}
          className="mt-6 inline-flex px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          Review profile settings
        </Link>
      </div>
    );
  }

  return <HeroSectionContent featuredItem={featuredItem} />;
}
