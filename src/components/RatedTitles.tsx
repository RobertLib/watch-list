"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Star, X } from "lucide-react";
import { getTitlesByRefs } from "@/app/actions";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ShareListButton } from "@/components/ShareListButton";
import { useRatings } from "@/hooks/useRatings";
import {
  MAX_RATED_SHOWN,
  RATED_SORT_LABELS,
  ratedRefs,
  sortRated,
  summarizeRated,
  type RatedSort,
} from "@/lib/rated-view";
import { getImageUrl } from "@/lib/tmdb-image";
import { cn, createSlug, mediaItemKey } from "@/lib/utils";
import type { MediaItem } from "@/types/tmdb";

/**
 * Everything the viewer has scored, with the score.
 *
 * Built from the ratings store rather than from the watchlist. Scoring a title
 * marks it watched, but nothing clears the score when it leaves that list again –
 * emptying the watched tab, or restoring a backup taken at a different moment,
 * both leave scores behind. Reading the watched list would quietly hide exactly
 * those, which is the failure this page exists to fix.
 *
 * The store keeps a score and a date, so every title is resolved from TMDB by id,
 * the same way a shared list is.
 */
export function RatedTitles() {
  const { ratings, unrate } = useRatings();
  const [sort, setSort] = useState<RatedSort>("score");
  const [cards, setCards] = useState<Record<string, MediaItem>>({});
  const [hasLoaded, setHasLoaded] = useState(false);

  const refs = useMemo(() => ratedRefs(ratings), [ratings]);
  const sorted = useMemo(
    () => sortRated(refs, sort).slice(0, MAX_RATED_SHOWN),
    [refs, sort],
  );
  const summary = useMemo(() => summarizeRated(refs), [refs]);

  // Keyed on the ids rather than on the array, so re-scoring a title already on
  // the page does not re-fetch every card.
  const lookupKey = useMemo(
    () =>
      refs
        .map((ref) => mediaItemKey(ref.id, ref.mediaType))
        .sort()
        .slice(0, MAX_RATED_SHOWN)
        .join(","),
    [refs],
  );

  useEffect(() => {
    if (lookupKey === "") {
      setHasLoaded(true);
      return;
    }

    let isCurrent = true;

    (async () => {
      try {
        const items = await getTitlesByRefs(
          lookupKey.split(",").map((key) => {
            const [mediaType, id] = key.split("-");
            return { id: Number(id), mediaType };
          }),
        );

        if (!isCurrent) return;

        setCards(
          Object.fromEntries(
            items.map((item) => [
              mediaItemKey(item.id, item.media_type),
              item,
            ]),
          ),
        );
      } catch (error) {
        console.error("Error loading rated titles:", error);
      } finally {
        if (isCurrent) setHasLoaded(true);
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [lookupKey]);

  if (!hasLoaded) {
    return (
      <div className="py-16">
        <LoadingSpinner />
      </div>
    );
  }

  if (refs.length === 0) return <NothingRated />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-gray-400">
          {summary.total} rated
          {summary.series > 0 &&
            ` · ${summary.films} film${summary.films === 1 ? "" : "s"}, ${
              summary.series
            } series`}
          {summary.average !== null &&
            ` · you average ${summary.average.toFixed(1)}`}
        </p>

        <div className="flex items-center gap-3">
          <label htmlFor="rated-sort" className="sr-only">
            Order
          </label>
          <select
            id="rated-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as RatedSort)}
            className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            {(Object.keys(RATED_SORT_LABELS) as RatedSort[]).map((option) => (
              <option key={option} value={option}>
                {RATED_SORT_LABELS[option]}
              </option>
            ))}
          </select>

          <ShareListButton
            items={sorted.map((ref) => ({
              id: ref.id,
              mediaType: ref.mediaType,
            }))}
            defaultTitle="Films I have rated"
          />
        </div>
      </div>

      <ul className="space-y-2">
        {sorted.map((ref) => {
          const key = mediaItemKey(ref.id, ref.mediaType);
          const card = cards[key];
          // A title TMDB no longer knows still has a score, and hiding the row
          // would make the count above look wrong.
          const title = card?.title ?? `Title ${ref.id}`;

          return (
            <li
              key={key}
              className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-900/60 border border-gray-800 hover:border-gray-700 transition-colors group"
            >
              <Link
                href={`/${ref.mediaType}/${createSlug(title, ref.id)}`}
                prefetch={false}
                className="flex flex-1 min-w-0 items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg"
              >
                <div className="relative w-10 aspect-2/3 shrink-0 rounded overflow-hidden bg-gray-800">
                  {card?.poster_path && (
                    <Image
                      src={getImageUrl(card.poster_path, "w185")}
                      alt=""
                      fill
                      className="object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white group-hover:text-blue-300 transition-colors truncate">
                    {title}
                  </p>
                  <p className="text-xs text-gray-500">
                    {ref.mediaType === "movie" ? "Film" : "Series"}
                    {card?.release_date && ` · ${card.release_date.slice(0, 4)}`}
                    {ref.ratedAt && ` · rated ${ref.ratedAt.slice(0, 10)}`}
                  </p>
                </div>
              </Link>

              <span
                className={cn(
                  "flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-full text-sm font-semibold tabular-nums",
                  ref.rating >= 8
                    ? "bg-green-500/15 text-green-300"
                    : ref.rating >= 5
                      ? "bg-yellow-500/15 text-yellow-200"
                      : "bg-red-500/15 text-red-300",
                )}
              >
                <Star className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true" />
                {ref.rating}
              </span>

              <button
                onClick={() => unrate(ref.id, ref.mediaType)}
                aria-label={`Remove your score for ${title}`}
                className="p-1.5 shrink-0 rounded-lg text-gray-500 hover:text-red-300 hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>

      {refs.length > MAX_RATED_SHOWN && (
        <p className="text-sm text-gray-500">
          Showing the first {MAX_RATED_SHOWN} of {refs.length}. Each one costs a
          lookup, so the page stops there.
        </p>
      )}
    </div>
  );
}

function NothingRated() {
  return (
    <div className="text-center py-16">
      <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
        <Star className="w-10 h-10 text-gray-600" aria-hidden="true" />
      </div>
      <h2 className="text-2xl font-bold mb-3">You have not rated anything</h2>
      <p className="text-gray-400 max-w-md mx-auto">
        Score anything out of ten from its page. Your scores stay in this browser,
        show up here, and pull your recommendations towards what you actually
        liked.
      </p>
      <Link
        href="/"
        prefetch={false}
        className="mt-6 inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
      >
        Discover Content
      </Link>
    </div>
  );
}
