"use client";

import { VideoOverlay } from "@/components/VideoOverlay";
import { useVideoOverlay } from "@/hooks/useVideoOverlay";
import { useT } from "@/i18n/LocaleProvider";
import { Video } from "@/types/tmdb";

interface MovieTrailerButtonProps {
  trailer?: Video;
}

// Handed the trailer rather than the film's id: the page already has `videos`
// appended to its details, so the overlay opens on the known key instead of
// asking TMDB for the same list again – see `showVideo`.
export function MovieTrailerButton({ trailer }: MovieTrailerButtonProps) {
  const { isOpen, video, isLoading, showVideo, closeVideo } = useVideoOverlay();
  const t = useT();

  if (!trailer) return null;

  return (
    <>
      <div className="mt-6">
        <button
          type="button"
          onClick={() => showVideo(trailer)}
          className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-black"
          aria-label={t("Play movie trailer", "Přehrát trailer filmu")}
        >
          <svg
            className="w-5 h-5"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
          {t("Play Trailer", "Přehrát trailer")}
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
