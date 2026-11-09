"use client";

import { useId, useRef, useState } from "react";
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
 * Because a score is a write with side effects – the title is marked watched,
 * leaves the watchlist and a toast says so – moving through the stars must not
 * save anything. The stars used to be a radio group, whose contract is that the
 * arrow keys *select*: tabbing into an unrated title and pressing → to look
 * around rated it 2/10, marked it watched and dropped it from the watchlist, and
 * ← on the first star wrapped to a 10. They are now a toolbar of ordinary
 * buttons instead – the arrows (and Home/End) only move focus and preview the
 * score, exactly as hovering does for a mouse, and Enter or Space commits it.
 * The saved score is the button carrying `aria-current`, so a screen reader
 * still hears which one is in effect without the arrows claiming to change it.
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
  const hintId = useId();
  // The score the stars preview instead of the saved one: the star under the
  // pointer, or the one keyboard focus is on.
  const [previewed, setPreviewed] = useState<number | null>(null);
  // The star holding focus, so the single Tab stop travels with the arrows and
  // returns to the saved score once focus leaves the row.
  const [focusedValue, setFocusedValue] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const ratingButtons = useRef<Array<HTMLButtonElement | null>>([]);
  // Set while focus is moved here by code rather than by the visitor, so that
  // focus alone does not light up a score nobody chose.
  const quietFocus = useRef(false);

  const current = ratingFor(item.id, item.media_type);
  // While the pointer or keyboard focus is on a star, the row previews that
  // score instead of the saved one – otherwise there is no way to tell what a
  // click, Enter or Space will do.
  const shown = previewed ?? current ?? 0;
  const tabStop = focusedValue ?? current ?? MIN_RATING;

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

  async function handleClear(event: React.MouseEvent<HTMLButtonElement>) {
    if (saving.current || !checkProfile(profileId)) return;
    // Clearing removes this button, which would drop keyboard focus on the
    // page body. Hand it to the stars instead, where the next score is chosen.
    const hadFocus = document.activeElement === event.currentTarget;
    saving.current = true;
    setIsSaving(true);
    try {
      if (!(await clearTitleRating(profileId, item.id, item.media_type))) {
        toast.showToast(STORAGE_REFUSED_MESSAGE, "error");
        return;
      }
      toast.showToast("Rating removed", "info");
      if (hadFocus) {
        quietFocus.current = true;
        ratingButtons.current[0]?.focus();
        quietFocus.current = false;
      }
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }

  // The toolbar pattern: one Tab stop, arrows move between the stars. Moving
  // only previews; nothing is saved until a star is clicked or pressed with
  // Enter or Space, which a button does natively. A scale does not wrap – ←
  // on the first star stays there rather than jumping to a ten.
  function handleRatingKeyDown(event: React.KeyboardEvent, value: number) {
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = Math.min(value + 1, MAX_RATING);
        break;
      case "ArrowLeft":
        next = Math.max(value - 1, MIN_RATING);
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
    ratingButtons.current[next - MIN_RATING]?.focus();
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
              type="button"
              onClick={handleClear}
              // Not native `disabled`: that blurs a focused button in browsers.
              // `handleClear` itself refuses to start a second save.
              aria-disabled={isSaving}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-white aria-disabled:cursor-wait aria-disabled:opacity-60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            >
              <X className="w-3 h-3" aria-hidden="true" />
              Clear
            </button>
          </>
        )}
      </div>

      <div
        role="toolbar"
        aria-busy={isSaving}
        aria-label={`Rate ${item.title} out of ten`}
        className="flex items-center gap-0.5"
        onMouseLeave={() => setPreviewed(null)}
      >
        {VALUES.map((value) => {
          const isFilled = value <= shown;

          return (
            <button
              key={value}
              ref={(button) => { ratingButtons.current[value - MIN_RATING] = button; }}
              type="button"
              // Native disabled blurs the focused star in browsers. Keep it
              // focusable while the action guards reject another pending save.
              aria-disabled={isSaving}
              // The saved score, announced as "current" – not `aria-pressed`,
              // which would promise that pressing it again takes the score away.
              aria-current={current === value ? "true" : undefined}
              // Unrated, every star says what saving a score also does.
              aria-describedby={current === null ? hintId : undefined}
              aria-label={`Rate ${value} out of 10`}
              title={`Rate ${value} out of 10`}
              tabIndex={value === tabStop ? 0 : -1}
              onMouseEnter={() => setPreviewed(value)}
              onFocus={() => {
                setFocusedValue(value);
                if (!quietFocus.current) setPreviewed(value);
              }}
              onBlur={() => {
                setFocusedValue(null);
                setPreviewed(null);
              }}
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
        <p id={hintId} className="text-xs text-gray-500">
          Rating a title marks it watched and sharpens your recommendations.
        </p>
      )}
    </div>
  );
}
