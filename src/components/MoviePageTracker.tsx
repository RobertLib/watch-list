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
        "MoviePageTracker: Skipping submission in development mode or localhost",
      );
      return;
    }

    // Only submit once per 30 days per URL (matches ISR revalidation period)
    // to avoid wasting Vercel Function invocations on every page visit
    const storageKey = `indexnow_movie_${slug}`;
    const lastSubmitted = localStorage.getItem(storageKey);
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (lastSubmitted && Date.now() - parseInt(lastSubmitted) < thirtyDays) {
      return;
    }

    // Submit the movie page to IndexNow after a short delay
    const timer = setTimeout(async () => {
      const success = await submitMoviePage(movieId, slug);
      if (success) {
        localStorage.setItem(storageKey, Date.now().toString());
      }
    }, 2000); // Wait 2 seconds to ensure page is fully loaded

    return () => clearTimeout(timer);
  }, [movieId, slug, submitMoviePage]);

  return null;
}
