"use client";

import { useRef, useState } from "react";
import { Star, X } from "lucide-react";
import { useRatings } from "@/hooks/useRatings";
import { useWatched } from "@/contexts/WatchedContext";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { useProfileGuard } from "@/hooks/useProfileGuard";
import { toast } from "@/components/Toast";
import { MAX_RATING, MIN_RATING } from "@/lib/ratings";
import { STORAGE_REFUSED_MESSAGE } from "@/lib/media-list";
import { clearTitleRating, rateTitleAndMarkWatched } from "@/lib/watched-actions";
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
  const { ratingFor, profileId } = useRatings();
  const { refreshWatched, profileId: watchedProfileId } = useWatched();
  const { refreshWatchlist, profileId: watchlistProfileId } = useWatchlist();
  const { checkProfile } = useProfileGuard();
  const [hovered, setHovered] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const ratingButtons = useRef<Array<HTMLButtonElement | null>>([]);

  const current = ratingFor(item.id, item.media_type);
  // While the pointer is over the row, the stars preview that score instead of
  // the saved one – otherwise there is no way to tell what a click will do.
  const shown = hovered ?? current ?? 0;

  async function handleRate(value: number) {
    if (saving.current || !checkProfile(profileId)) return;
    if (watchedProfileId !== profileId || watchlistProfileId !== profileId) {
      toast.showToast("Your active profile changed. Review the current title and try again.", "info");
      return;
    }

    saving.current = true;
    setIsSaving(true);
    try {
      const result = await rateTitleAndMarkWatched(profileId, item, value);
      refreshWatched();
      refreshWatchlist();
      if (result.status === "profile-unavailable") {
        toast.showToast("The profile for this action was deleted. Review the current title and try again.", "info");
      } else if (result.status === "failed" || result.status === "rating-failed") {
        toast.showToast(STORAGE_REFUSED_MESSAGE, "error");
      } else if (result.status === "watched-failed") {
        toast.showToast(
          `Rated ${value}/10, but could not mark as watched. Check your browser's storage settings.`,
          "error",
        );
      } else if (result.status === "watchlist-failed") {
        toast.showToast(
          `Rated ${value}/10${result.wasWatched ? "" : " and marked as watched"}, but your browser would not remove it from your watchlist`,
          "error",
        );
      } else if (result.status === "ok") {
        toast.showToast(
          result.wasWatched
            ? `Rated ${value}/10${result.wasQueued ? " and removed from your watchlist" : ""}`
            : result.wasQueued
              ? `Rated ${value}/10, marked as watched and removed from your watchlist`
              : `Rated ${value}/10 and marked as watched`,
          "success",
        );
      }
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }

  async function handleClear() {
    if (saving.current || !checkProfile(profileId)) return;
    saving.current = true;
    setIsSaving(true);
    try {
      if (!(await clearTitleRating(profileId, item.id, item.media_type))) {
        toast.showToast(STORAGE_REFUSED_MESSAGE, "error");
        return;
      }
      toast.showToast("Rating removed", "info");
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }

  function handleRatingKeyDown(event: React.KeyboardEvent, value: number) {
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = value === MAX_RATING ? MIN_RATING : value + 1;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = value === MIN_RATING ? MAX_RATING : value - 1;
        break;
      case "Home":
        next = MIN_RATING;
        break;
      case "End":
        next = MAX_RATING;
        break;
      default:
        return;
    }

    event.preventDefault();
    if (saving.current) return;
    ratingButtons.current[next - MIN_RATING]?.focus();
    handleRate(next);
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
              onClick={handleClear}
              disabled={isSaving}
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
        aria-busy={isSaving}
        aria-label={`Rate ${item.title} out of ten`}
        className="flex items-center gap-0.5"
        onMouseLeave={() => setHovered(null)}
      >
        {VALUES.map((value) => {
          const isFilled = value <= shown;

          return (
            <button
              key={value}
              ref={(button) => { ratingButtons.current[value - MIN_RATING] = button; }}
              type="button"
              role="radio"
              // Native disabled blurs the focused radio in browsers. Keep it
              // focusable while the action guards reject another pending save.
              aria-disabled={isSaving}
              aria-checked={current === value}
              aria-label={`${value} out of 10`}
              title={`${value} out of 10`}
              tabIndex={value === (current ?? MIN_RATING) ? 0 : -1}
              onMouseEnter={() => setHovered(value)}
              onFocus={() => setHovered(value)}
              onBlur={() => setHovered(null)}
              onClick={() => handleRate(value)}
              onKeyDown={(event) => handleRatingKeyDown(event, value)}
              className="cursor-pointer aria-disabled:cursor-wait aria-disabled:opacity-60 p-0.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
