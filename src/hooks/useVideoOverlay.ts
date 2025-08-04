"use client";

import { useState, useCallback } from "react";
import { Video } from "@/types/tmdb";
import { trackVideoPlay } from "@/lib/analytics";

export function useVideoOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [video, setVideo] = useState<Video | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const openVideo = useCallback(
    async (mediaId: number, mediaType: "movie" | "tv", title?: string) => {
      setIsLoading(true);
      setIsOpen(true);

      try {
        // Call our API route instead of direct TMDB API
        const response = await fetch(`/api/videos/${mediaType}/${mediaId}`);

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const videos = await response.json();

        // Find the first official trailer
        const trailer =
          videos.results.find(
            (video: Video) =>
              video.site === "YouTube" &&
              video.type === "Trailer" &&
              video.official
          ) ||
          videos.results.find(
            (video: Video) =>
              video.site === "YouTube" && video.type === "Trailer"
          ) ||
          videos.results[0];

        setVideo(trailer || null);

        // Track video play event
        if (trailer && title) {
          trackVideoPlay(mediaId, mediaType, title, trailer.type);
        }
      } catch (error) {
        console.error("Error loading video:", error);
        setVideo(null);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const closeVideo = useCallback(() => {
    setIsOpen(false);
    setVideo(null);
  }, []);

  return {
    isOpen,
    video,
    isLoading,
    openVideo,
    closeVideo,
  };
}
