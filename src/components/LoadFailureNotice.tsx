"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * "We asked TMDB and got nothing back", rendered inside a page that did load.
 *
 * The counterpart to `NotFoundNotice`: that one says the title does not exist,
 * this one says the request failed and is worth repeating. The distinction
 * matters to the visitor – one is a dead end, the other is a button.
 *
 * It exists because `app/error.tsx` cannot cover this. Every load in the app
 * goes through `useAsyncData`, which catches its own rejections, so a failed
 * fetch never reaches an error boundary; without something like this the page
 * that failed simply sat on its skeleton forever.
 *
 * The full-size notice usually *is* the page – a detail page that failed has
 * nothing else on it – so its title is the page's `h1` by default; without one
 * a screen reader landing there found no heading to orient by. The compact one
 * sits inside a page that has its own, and is an `h2`. A full-size notice
 * shown under a page heading of its own passes `headingLevel={2}`.
 */
export function LoadFailureNotice({
  title = "Could not load this section",
  description = "TMDB did not answer. It may be a connection problem, or the service may be busy.",
  onRetry,
  compact = false,
  headingLevel = compact ? 2 : 1,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  compact?: boolean;
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";

  return (
    <div
      role="alert"
      className={
        compact
          ? "container mx-auto px-4 sm:px-6 lg:px-8 py-10 text-center"
          : "container mx-auto px-6 py-24 text-center"
      }
    >
      <div
        className={`${
          compact ? "w-12 h-12 mb-4" : "w-20 h-20 mb-6"
        } mx-auto rounded-full bg-gray-800 flex items-center justify-center`}
      >
        <AlertTriangle
          className={`${compact ? "w-6 h-6" : "w-10 h-10"} text-red-500`}
          aria-hidden="true"
        />
      </div>

      <Heading
        className={compact ? "text-xl font-bold mb-2" : "text-3xl font-bold mb-3"}
      >
        {title}
      </Heading>
      <p className="text-gray-400 max-w-md mx-auto leading-relaxed">
        {description}
      </p>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Try again
        </button>
      )}
    </div>
  );
}
