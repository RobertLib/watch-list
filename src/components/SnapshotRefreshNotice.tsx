"use client";

import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "This is the saved copy; the live one did not arrive" – said beside content,
 * never instead of it.
 *
 * Shown where `useAsyncData` kept the build's snapshot on screen after the
 * browser's own load failed (`refreshError`). The snapshot is real content and
 * stays readable; what is missing is whatever the live answer adds – the
 * visitor's own region and services, the sections the snapshot leaves out – so
 * the notice is small, and its button is a retry of that load.
 *
 * A status rather than an alert: nothing the visitor was doing was interrupted.
 * The button stays mounted (and focusable) while the retry runs, reporting it
 * with `aria-disabled` instead of `disabled`, which would drop the focus of a
 * keyboard user who just pressed it.
 */
export function SnapshotRefreshNotice({
  message = "Showing a saved copy – the latest version could not be loaded.",
  onRetry,
  isRetrying = false,
  className,
}: {
  message?: string;
  onRetry: () => void;
  isRetrying?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-lg border border-gray-700 bg-gray-900/80 px-4 py-2 text-sm text-gray-300",
        className,
      )}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={() => {
          if (!isRetrying) onRetry();
        }}
        aria-disabled={isRetrying}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 aria-disabled:cursor-wait aria-disabled:opacity-60"
      >
        <RefreshCw
          className={cn("h-4 w-4", isRetrying && "animate-spin")}
          aria-hidden="true"
        />
        {isRetrying ? "Retrying…" : "Try again"}
      </button>
    </div>
  );
}
