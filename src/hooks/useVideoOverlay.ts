"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { tmdbApi } from "@/lib/tmdb";
import { findYouTubeTrailer, isPlayableYouTubeVideo } from "@/lib/trailer";
import type { Video } from "@/types/tmdb";

// Lives in `lib/trailer.ts` so the build can call it too – a function exported
// from a "use client" module is a client reference on the server. Re-exported
// for the components and tests that already import it from here.
export { findYouTubeTrailer } from "@/lib/trailer";

export function useVideoOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [video, setVideo] = useState<Video | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Which open is current. Bumped by every open, by close, and on unmount, so a
  // lookup that answers late – after the visitor closed the overlay, opened a
  // different title, or left the page – finds its id superseded and writes
  // nothing. Without it, close-then-answer put a trailer into a closed overlay,
  // where it waited to flash on the next open.
  const runId = useRef(0);

  useEffect(
    () => () => {
      runId.current += 1;
    },
    [],
  );

  const openVideo = useCallback(
    async (mediaId: number, mediaType: "movie" | "tv") => {
      const id = ++runId.current;
      const isCurrent = () => id === runId.current;

      setIsLoading(true);
      setIsOpen(true);

      try {
        const videos =
          mediaType === "movie"
            ? await tmdbApi.getMovieVideos(mediaId)
            : await tmdbApi.getTVShowVideos(mediaId);

        if (!isCurrent()) return;

        const trailer =
          findYouTubeTrailer(videos.results) ??
          // The shared player embeds YouTube only. A Vimeo key is not a
          // playable fallback, even when it happens to be the first result,
          // and nor is a YouTube entry whose key is not an id at all.
          videos.results.find((video: Video) => isPlayableYouTubeVideo(video));

        setVideo(trailer ?? null);
      } catch (error) {
        if (!isCurrent()) return;
        console.error("Error loading video:", error);
        setVideo(null);
      } finally {
        if (isCurrent()) setIsLoading(false);
      }
    },
    [],
  );

  // For a caller that already holds the video. A detail page has `videos`
  // appended to the details it loaded, and used to have the overlay ask TMDB
  // for them again: a second request and a spinner for nothing – and when that
  // request failed, "Video is not available" with the key already in hand.
  const showVideo = useCallback((known: Video) => {
    // Supersede any lookup still in flight, so it cannot replace this video.
    runId.current += 1;
    setVideo(known);
    setIsLoading(false);
    setIsOpen(true);
  }, []);

  const closeVideo = useCallback(() => {
    // Supersede whatever is in flight – see `runId`. Loading is cleared here
    // because the request that would have cleared it is no longer allowed to.
    runId.current += 1;
    setIsOpen(false);
    setVideo(null);
    setIsLoading(false);
  }, []);

  return {
    isOpen,
    video,
    isLoading,
    openVideo,
    showVideo,
    closeVideo,
  };
}
