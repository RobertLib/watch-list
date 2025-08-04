"use client";

import { useEffect } from "react";
import { useIndexNowContext } from "@/contexts/IndexNowContext";

interface TVPageTrackerProps {
  tvId: number;
  slug: string;
}

/**
 * Component that automatically submits TV show pages to IndexNow
 */
export function TVPageTracker({ tvId, slug }: TVPageTrackerProps) {
  const { submitTVShowPage } = useIndexNowContext();

  useEffect(() => {
    // Skip in development or if running on localhost
    const isLocalhost =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1" ||
        window.location.hostname.includes("localhost"));

    if (process.env.NODE_ENV !== "production" || isLocalhost) {
      console.log(
        "TVPageTracker: Skipping submission in development mode or localhost"
      );
      return;
    }

    // Submit the TV show page to IndexNow after a short delay
    const timer = setTimeout(() => {
      submitTVShowPage(tvId, slug);
    }, 2000); // Wait 2 seconds to ensure page is fully loaded

    return () => clearTimeout(timer);
  }, [tvId, slug, submitTVShowPage]);

  return null;
}
