import Image from "next/image";
import { Star } from "lucide-react";
import { MediaItem, TMDBResponse } from "@/types/tmdb";
import { tmdbApi } from "@/lib/tmdb";
import { HeroButtons } from "./HeroButtons";
import { HeroSkeleton } from "@/components/skeletons";

interface HeroSectionContentProps {
  featuredItem: MediaItem;
}

function HeroSectionContent({ featuredItem }: HeroSectionContentProps) {
  const backdropUrl = tmdbApi.getImageUrl(
    featuredItem.backdrop_path,
    "original"
  );
  const year = new Date(featuredItem.release_date).getFullYear();

  // Get the correct title for both movies and TV shows
  const title =
    featuredItem.title ||
    ("name" in featuredItem
      ? (featuredItem as { name: string }).name
      : "Unknown Title");

  return (
    <div className="relative h-[50vh] sm:h-[60vh] lg:h-[70vh] w-full overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <Image
          src={backdropUrl}
          alt={`Featured backdrop for ${title}`}
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-linear-to-r from-black/80 via-black/40 to-transparent" />
        <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div className="relative h-full flex items-center min-h-0 py-4 sm:py-6">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="max-w-2xl space-y-3 sm:space-y-4 lg:space-y-6">
            {/* Title */}
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-white leading-tight">
              {title}
            </h1>

            {/* Meta information */}
            <div className="flex items-center gap-2 sm:gap-4 text-sm sm:text-base text-gray-200">
              <div
                className="flex items-center gap-1"
                role="img"
                aria-label={`Rating: ${featuredItem.vote_average?.toFixed(
                  1
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

interface HeroSectionProps {
  trendingData: TMDBResponse<MediaItem>;
}

export function HeroSection({ trendingData }: HeroSectionProps) {
  const featuredItem = trendingData.results[0] || null;

  if (!featuredItem) {
    return <HeroSkeleton gradientFrom="from-gray-900" />;
  }

  return <HeroSectionContent featuredItem={featuredItem} />;
}
