"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * `retry` rather than `reset`.
 *
 * Both props are passed, and the button worked either way – but they do
 * different things, and this one wanted the other. `reset()` clears the error
 * state and re-renders the boundary's children; `retry()` re-fetches first and
 * then re-renders. Next 16.3 made `retry` stable and documents it as the one to
 * reach for, keeping `reset` for the narrow case where re-fetching is
 * specifically not wanted.
 *
 * Nothing here is that case. Every page in this app loads from TMDB in an effect
 * and the errors that land in this boundary are overwhelmingly a failed load –
 * a request that timed out, a 429 against a shared read token. Re-rendering
 * those children without re-fetching asks the visitor to press a button that
 * re-runs the render which already threw.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
      <h2 className="text-2xl font-bold mb-2">Something went wrong!</h2>
      <p className="text-gray-400 text-lg mb-4">
        Failed to load content. Please try again later.
      </p>
      <button
        onClick={() => retry()}
        className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-md transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        Try Again
      </button>
    </div>
  );
}
