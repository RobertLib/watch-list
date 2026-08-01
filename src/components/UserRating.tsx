"use client";

import { useState } from "react";
import { Star, X } from "lucide-react";
import { useRatings } from "@/hooks/useRatings";
import { useWatched } from "@/contexts/WatchedContext";
import { toast } from "@/components/Toast";
import { MAX_RATING, MIN_RATING } from "@/lib/ratings";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/types/tmdb";

const VALUES = Array.from(
  { length: MAX_RATING - MIN_RATING + 1 },
  (_, index) => MIN_RATING + index,
);

/**
 * "Your rating" – ten stars, out of ten to match every other score on the site.
 *
 * Scoring something also marks it watched: you cannot have an opinion on a film
 * you have not seen, and asking someone to press two buttons for one statement is
 * how a feature goes unused.
 *
 * Buttons carrying `role="radio"` rather than real `<input type="radio">`, which
 * is also how the platform picker is built. Native radios are checked by the
 * browser the moment their label is clicked, and React then finds a group member
 * whose state it did not set – "Mixing React and non-React radio inputs with the
 * same name". Buttons have no browser-managed checked state to disagree with.
 */
export function UserRating({
  item,
  className,
}: {
  item: MediaItem;
  className?: string;
}) {
  const { ratingFor, rate, unrate } = useRatings();
  const { isWatched, addItem } = useWatched();
  const [hovered, setHovered] = useState<number | null>(null);

  const current = ratingFor(item.id, item.media_type);
  // While the pointer is over the row, the stars preview that score instead of
  // the saved one – otherwise there is no way to tell what a click will do.
  const shown = hovered ?? current ?? 0;

  function handleRate(value: number) {
    rate(item.id, item.media_type, value);

    if (!isWatched(item.id, item.media_type)) {
      addItem(item);
      toast.showToast(`Rated ${value}/10 and marked as watched`, "success");
      return;
    }

    toast.showToast(`Rated ${value}/10`, "success");
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-gray-300">Your rating</p>
        {current !== null && (
          <>
            <span className="text-sm font-semibold text-yellow-400">
              {current}/10
            </span>
            <button
              onClick={() => {
                unrate(item.id, item.media_type);
                toast.showToast("Rating removed", "info");
              }}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            >
              <X className="w-3 h-3" aria-hidden="true" />
              Clear
            </button>
          </>
        )}
      </div>

      <div
        role="radiogroup"
        aria-label={`Rate ${item.title} out of ten`}
        className="flex items-center gap-0.5"
        onMouseLeave={() => setHovered(null)}
      >
        {VALUES.map((value) => {
          const isFilled = value <= shown;

          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={current === value}
              aria-label={`${value} out of 10`}
              title={`${value} out of 10`}
              onMouseEnter={() => setHovered(value)}
              onFocus={() => setHovered(value)}
              onBlur={() => setHovered(null)}
              onClick={() => handleRate(value)}
              className="cursor-pointer p-0.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <Star
                className={cn(
                  "w-5 h-5 transition-colors",
                  isFilled
                    ? "text-yellow-400 fill-current"
                    : "text-gray-600 hover:text-gray-400",
                )}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>

      {current === null && (
        <p className="text-xs text-gray-500">
          Rating a title marks it watched and sharpens your recommendations.
        </p>
      )}
    </div>
  );
}
