"use client";

import { useEffect } from "react";
import { useIndexNow } from "@/hooks/useIndexNow";

interface IndexNowTrackerProps {
  /** Whether to submit the current page URL to IndexNow on mount */
  autoSubmit?: boolean;
  /** Specific paths to submit to IndexNow */
  paths?: string[];
  /** Whether to enable debug logging */
  debug?: boolean;
}

/**
 * Component that automatically submits URLs to IndexNow for better SEO
 */
export function IndexNowTracker({
  autoSubmit = true,
  paths,
  debug = false,
}: IndexNowTrackerProps) {
  const { submitCurrentPage, submitPath } = useIndexNow();

  useEffect(() => {
    const submitToIndexNow = async () => {
      // Skip in development or if running on localhost
      const isLocalhost =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1" ||
          window.location.hostname.includes("localhost"));

      if (process.env.NODE_ENV !== "production" || isLocalhost) {
        if (debug)
          console.log(
            "IndexNowTracker: Skipping submission in development mode or localhost"
          );
        return;
      }

      // Skip URLs with query parameters (filters)
      if (typeof window !== "undefined" && window.location.search) {
        if (debug)
          console.log(
            "IndexNowTracker: Skipping submission for filtered URL with query parameters"
          );
        return;
      }

      // Rate limit: Only submit once per session per page to reduce CPU usage
      const sessionKey = `indexnow_submitted_${window.location.pathname}`;
      if (sessionStorage.getItem(sessionKey)) {
        if (debug)
          console.log(
            "IndexNowTracker: Already submitted this page in this session"
          );
        return;
      }

      try {
        // Submit current page if autoSubmit is enabled
        if (autoSubmit) {
          if (debug) console.log("IndexNowTracker: Submitting current page");
          await submitCurrentPage();
          sessionStorage.setItem(sessionKey, "true");
        }

        // Submit additional paths if provided
        if (paths && paths.length > 0) {
          if (debug)
            console.log("IndexNowTracker: Submitting additional paths:", paths);
          for (const path of paths) {
            await submitPath(path);
          }
        }
      } catch (error) {
        if (debug)
          console.error(
            "IndexNowTracker: Error submitting to IndexNow:",
            error
          );
      }
    };

    // Delay submission to avoid blocking initial page load
    const timer = setTimeout(submitToIndexNow, 3000);

    return () => clearTimeout(timer);
  }, [autoSubmit, paths, debug, submitCurrentPage, submitPath]);

  // This component doesn't render anything
  return null;
}
