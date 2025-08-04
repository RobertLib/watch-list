"use client";

import { useState, useCallback } from "react";
import { tmdbApi } from "@/lib/tmdb";
import { Video } from "@/types/tmdb";

export function useVideoOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [video, setVideo] = useState<Video | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const openVideo = useCallback(
    async (mediaId: number, mediaType: "movie" | "tv") => {
      setIsLoading(true);
      setIsOpen(true);

      try {
        let videos;
        if (mediaType === "movie") {
          videos = await tmdbApi.getMovieVideos(mediaId);
        } else {
          videos = await tmdbApi.getTVShowVideos(mediaId);
        }

        // Find the first official trailer
        const trailer =
          videos.results.find(
            (video) =>
              video.site === "YouTube" &&
              video.type === "Trailer" &&
              video.official
          ) ||
          videos.results.find(
            (video) => video.site === "YouTube" && video.type === "Trailer"
          ) ||
          videos.results[0];

        setVideo(trailer || null);
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
