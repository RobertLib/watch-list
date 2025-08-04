"use client";

import { VideoOverlay } from "@/components/VideoOverlay";
import { useVideoOverlay } from "@/hooks/useVideoOverlay";
import { Video } from "@/types/tmdb";

interface MovieTrailerButtonProps {
  movieId: number;
  trailer?: Video;
  title: string;
}

export function MovieTrailerButton({
  movieId,
  trailer,
  title,
}: MovieTrailerButtonProps) {
  const { isOpen, video, isLoading, openVideo, closeVideo } = useVideoOverlay();

  const handlePlayClick = async () => {
    await openVideo(movieId, "movie", title);
  };

  if (!trailer) return null;

  return (
    <>
      <div className="mt-6">
        <button
          onClick={handlePlayClick}
          disabled={isLoading}
          className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-black"
          aria-label="Play movie trailer"
          aria-busy={isLoading}
        >
          <svg
            className="w-5 h-5"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
          {isLoading ? "Loading..." : "Play Trailer"}
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
