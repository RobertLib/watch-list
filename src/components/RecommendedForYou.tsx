"use client";

import { useEffect, useMemo, useState } from "react";
import { MediaCarousel } from "@/components/MediaCarousel";
import { CarouselSkeleton } from "@/components/skeletons";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { getWatchlistRecommendations } from "@/app/actions";
import type { RecommendationsResult } from "@/lib/recommendations";

// Mirrors the server-side cap – anything beyond it is discarded there anyway.
const MAX_ITEMS_SENT = 100;
// Adding several titles in a row should cost one request, not one per click.
const REFRESH_DELAY_MS = 500;

const EMPTY_RESULT: RecommendationsResult = { items: [], basedOn: [] };

/**
 * "Recommended for You" carousel driven by the watchlist.
 *
 * The watchlist is client state (a cookie written in the browser), so the picks
 * are requested after mount – the home page itself stays statically rendered.
 */
export function RecommendedForYou() {
  const { watchlist, isLoading } = useWatchlist();
  const [result, setResult] = useState<RecommendationsResult>(EMPTY_RESULT);
  const [isFetching, setIsFetching] = useState(false);

  const seeds = useMemo(
    () =>
      [...watchlist]
        .sort(
          (a, b) =>
            new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime(),
        )
        .slice(0, MAX_ITEMS_SENT)
        .map((item) => ({
          id: item.id,
          mediaType: item.mediaType,
          title: item.title,
        })),
    [watchlist],
  );

  useEffect(() => {
    if (isLoading) return;

    if (seeds.length === 0) {
      setResult(EMPTY_RESULT);
      return;
    }

    let isCurrent = true;
    setIsFetching(true);

    const timer = setTimeout(async () => {
      try {
        const recommendations = await getWatchlistRecommendations(seeds);
        if (isCurrent) setResult(recommendations);
      } catch (error) {
        console.error("Error loading recommendations:", error);
        if (isCurrent) setResult(EMPTY_RESULT);
      } finally {
        if (isCurrent) setIsFetching(false);
      }
    }, REFRESH_DELAY_MS);

    // Watchlist changed (or the user navigated away) – drop the stale response.
    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [seeds, isLoading]);

  if (isLoading || seeds.length === 0) return null;

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

/** e.g. "Based on Dune and Arrival, plus 3 more from your watchlist" */
function buildSubtitle(basedOn: string[]): string | undefined {
  const titles = basedOn.filter(Boolean);
  if (titles.length === 0) return undefined;

  const shown = titles.slice(0, 2);
  const remaining = titles.length - shown.length;
  const named = shown.join(" and ");

  return remaining > 0
    ? `Based on ${named}, plus ${remaining} more from your watchlist`
    : `Based on ${named} from your watchlist`;
}
