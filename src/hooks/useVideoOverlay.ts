"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { tmdbApi } from "@/lib/tmdb";
import { Video } from "@/types/tmdb";

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

        // Find the first official trailer
        const trailer =
          videos.results.find(
            (video: Video) =>
              video.site === "YouTube" &&
              video.type === "Trailer" &&
              video.official,
          ) ||
          videos.results.find(
            (video: Video) =>
              video.site === "YouTube" && video.type === "Trailer",
          ) ||
          videos.results[0];

        setVideo(trailer || null);
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
    closeVideo,
  };
}
