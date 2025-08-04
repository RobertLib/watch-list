"use client";

import { useEffect } from "react";
import { useIndexNowContext } from "@/contexts/IndexNowContext";

interface MoviePageTrackerProps {
  movieId: number;
  slug: string;
}

/**
 * Component that automatically submits movie pages to IndexNow
 */
export function MoviePageTracker({ movieId, slug }: MoviePageTrackerProps) {
  const { submitMoviePage } = useIndexNowContext();

  useEffect(() => {
    // Skip in development or if running on localhost
    const isLocalhost =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1" ||
        window.location.hostname.includes("localhost"));

    if (process.env.NODE_ENV !== "production" || isLocalhost) {
      console.log(
        "MoviePageTracker: Skipping submission in development mode or localhost"
      );
      return;
    }

    // Submit the movie page to IndexNow after a short delay
    const timer = setTimeout(() => {
      submitMoviePage(movieId, slug);
    }, 2000); // Wait 2 seconds to ensure page is fully loaded

    return () => clearTimeout(timer);
  }, [movieId, slug, submitMoviePage]);

  return null;
}
