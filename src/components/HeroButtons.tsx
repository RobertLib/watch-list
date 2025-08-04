"use client";

import { useRouter } from "next/navigation";
import { Play, Info } from "lucide-react";
import { MediaItem } from "@/types/tmdb";
import { VideoOverlay } from "./VideoOverlay";
import { useVideoOverlay } from "@/hooks/useVideoOverlay";
import { createSlug } from "@/lib/utils";

interface HeroButtonsProps {
  featuredItem: MediaItem;
}

export function HeroButtons({ featuredItem }: HeroButtonsProps) {
  const router = useRouter();
  const { isOpen, video, isLoading, openVideo, closeVideo } = useVideoOverlay();

  // Get the correct title for both movies and TV shows
  const title =
    featuredItem.title ||
    ("name" in featuredItem
      ? (featuredItem as { name: string }).name
      : "Unknown Title");

  const handlePlayClick = async () => {
    const mediaType = featuredItem.media_type === "movie" ? "movie" : "tv";
    await openVideo(featuredItem.id, mediaType, title);
  };

  const handleMoreInfoClick = () => {
    const slug = createSlug(title, featuredItem.id);
    const path =
      featuredItem.media_type === "movie" ? `/movie/${slug}` : `/tv/${slug}`;
    router.push(path);
  };

  return (
    <>
      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-2 sm:pt-4">
        <button
          onClick={handlePlayClick}
          disabled={isLoading}
          className="flex items-center justify-center gap-2 bg-white text-black px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3 rounded-md font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black"
          aria-label={`Play trailer for ${title}`}
          aria-busy={isLoading}
        >
          <Play className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
          {isLoading ? "Loading..." : "Play"}
        </button>

        <button
          onClick={handleMoreInfoClick}
          className="flex items-center justify-center gap-2 bg-gray-600/70 text-white px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3 rounded-md font-semibold hover:bg-gray-600/90 transition-colors backdrop-blur-sm text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black"
          aria-label={`View more information about ${title}`}
        >
          <Info className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
          More Info
        </button>
      </div>

      <VideoOverlay
        isOpen={isOpen}
        video={video}
        isLoading={isLoading}
        onClose={closeVideo}
      />
    </>
  );
}
