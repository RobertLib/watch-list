"use client";

import { useEffect, useMemo, useState } from "react";
import { MediaCarousel } from "@/components/MediaCarousel";
import { CarouselSkeleton } from "@/components/skeletons";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { useWatched } from "@/contexts/WatchedContext";
import { useRatings } from "@/hooks/useRatings";
import { getWatchlistRecommendations } from "@/app/actions";
import type { RecommendationsResult } from "@/lib/recommendations";
import type { MediaType } from "@/types/tmdb";

// Mirrors the server-side cap – anything beyond it is discarded there anyway.
const MAX_ITEMS_SENT = 100;
// Adding several titles in a row should cost one request, not one per click.
const REFRESH_DELAY_MS = 500;

const EMPTY_RESULT: RecommendationsResult = { items: [], basedOn: [] };

/**
 * "Recommended for You" carousel driven by the watchlist and the watched list.
 *
 * Both lists are client state (browser storage), so the picks are requested
 * after mount – the home page itself stays statically rendered.
 */
export function RecommendedForYou() {
  const { watchlist, isLoading: isWatchlistLoading } = useWatchlist();
  const { watched, isLoading: isWatchedLoading } = useWatched();
  const { ratingFor } = useRatings();
  const [result, setResult] = useState<RecommendationsResult>(EMPTY_RESULT);
  const [isFetching, setIsFetching] = useState(false);

  const isLoading = isWatchlistLoading || isWatchedLoading;

  const watchlistSeeds = useMemo(
    () => toSeeds(watchlist, (item) => item.addedAt, ratingFor),
    [watchlist, ratingFor],
  );
  const watchedSeeds = useMemo(
    () => toSeeds(watched, (item) => item.watchedAt, ratingFor),
    [watched, ratingFor],
  );
  const seedCount = watchlistSeeds.length + watchedSeeds.length;

  useEffect(() => {
    if (isLoading) return;

    if (seedCount === 0) {
      setResult(EMPTY_RESULT);
      return;
    }

    let isCurrent = true;
    setIsFetching(true);

    const timer = setTimeout(async () => {
      try {
        const recommendations = await getWatchlistRecommendations(
          watchlistSeeds,
          watchedSeeds,
        );
        if (isCurrent) setResult(recommendations);
      } catch (error) {
        console.error("Error loading recommendations:", error);
        if (isCurrent) setResult(EMPTY_RESULT);
      } finally {
        if (isCurrent) setIsFetching(false);
      }
    }, REFRESH_DELAY_MS);

    // A list changed (or the user navigated away) – drop the stale response.
    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [watchlistSeeds, watchedSeeds, seedCount, isLoading]);

  if (isLoading || seedCount === 0) return null;

  // Keep the previous picks on screen while a refresh is in flight.
  if (isFetching && result.items.length === 0) {
    return <CarouselSkeleton titleWidth="w-64" />;
  }

  if (result.items.length === 0) return null;

  return (
    <MediaCarousel
      id="recommended-for-you"
      title="Recommended for You"
      subtitle={buildSubtitle(result.basedOn)}
      items={result.items}
    />
  );
}

/** Newest first, since the latest picks describe the current mood best. */
function toSeeds<T extends { id: number; mediaType: MediaType; title: string }>(
  items: T[],
  savedAt: (item: T) => string,
  ratingFor: (id: number, mediaType: MediaType) => number | null,
): Array<{
  id: number;
  mediaType: MediaType;
  title: string;
  rating?: number;
}> {
  return [...items]
    .sort(
      (a, b) => new Date(savedAt(b)).getTime() - new Date(savedAt(a)).getTime(),
    )
    .slice(0, MAX_ITEMS_SENT)
    .map((item) => {
      const rating = ratingFor(item.id, item.mediaType);

      return {
        id: item.id,
        mediaType: item.mediaType,
        title: item.title,
        // Omitted rather than sent as null, so the server can tell "no opinion"
        // from a score it should weigh.
        ...(rating === null ? {} : { rating }),
      };
    });
}

/** e.g. "Based on Dune and Arrival, plus 3 more from your lists" */
function buildSubtitle(basedOn: string[]): string | undefined {
  const titles = basedOn.filter(Boolean);
  if (titles.length === 0) return undefined;

  const shown = titles.slice(0, 2);
  const remaining = titles.length - shown.length;
  const named = shown.join(" and ");

  return remaining > 0
    ? `Based on ${named}, plus ${remaining} more from your lists`
    : `Based on ${named} from your lists`;
}
