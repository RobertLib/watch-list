"use client";

import { useEffect, useMemo, useState } from "react";
import { MediaCarousel } from "@/components/MediaCarousel";
import { CarouselSkeleton } from "@/components/skeletons";
import { LoadFailureNotice } from "@/components/LoadFailureNotice";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { useWatched } from "@/contexts/WatchedContext";
import { useRatings } from "@/hooks/useRatings";
import { useSettingsKey } from "@/hooks/useSettings";
import { getWatchlistRecommendations } from "@/lib/api";
import type { RecommendationSeed, RecommendationsResult } from "@/lib/recommendations";
import { mediaItemKey } from "@/lib/utils";
import type { MediaType } from "@/types/tmdb";

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
  const {
    watchlist,
    isLoading: isWatchlistLoading,
    profileId: watchlistOwner,
  } = useWatchlist();
  const {
    watched,
    isLoading: isWatchedLoading,
    profileId: watchedOwner,
  } = useWatched();
  const { ratingFor, profileId: ratingsOwner } = useRatings();
  const settingsKey = useSettingsKey();
  const isLoading = isWatchlistLoading || isWatchedLoading;
  // Whose lists these are. Each store names the profile it last loaded, and
  // any one of them moving on means the picks on screen are someone else's.
  const owner = `${watchlistOwner}|${watchedOwner}|${ratingsOwner}`;

  const watchlistSeeds = useMemo(
    () => toSeeds(watchlist, (item) => item.addedAt, ratingFor),
    [watchlist, ratingFor],
  );
  const watchedSeeds = useMemo(
    () => toSeeds(watched, (item) => item.watchedAt, ratingFor),
    [watched, ratingFor],
  );
  const seedCount = watchlistSeeds.length + watchedSeeds.length;
  const [attempt, setAttempt] = useState(0);

  // The picks on screen, together with the lists, owner and settings they were
  // built from. Holding them together is what lets "still fetching" be derived
  // below rather than tracked as a flag the effect has to raise on its way in.
  const [loaded, setLoaded] = useState<Loaded>({
    seeds: null, owner, settingsKey, attempt, failed: false, result: EMPTY_RESULT,
  });

  const isFetching =
    loaded.attempt !== attempt ||
    loaded.owner !== owner ||
    loaded.settingsKey !== settingsKey ||
    loaded.seeds?.[0] !== watchlistSeeds || loaded.seeds?.[1] !== watchedSeeds;
  // An edit to the same profile's lists – usually the heart or the eye on one
  // of these very cards – keeps the carousel on screen while it refreshes.
  // Swapping it for a skeleton unmounted the card that was just clicked, took
  // its focus and the scroll position with it, and jumped the layout for the
  // half second of debounce plus the request.
  const isRevalidating = isFetching && isSameAudience(loaded, owner, settingsKey, attempt);
  // Anything else – another profile, region or platform choice – means the
  // picks on screen belong to someone or somewhere else. Never leave those
  // actionable during a refresh.
  const result = isFetching && !isRevalidating ? EMPTY_RESULT : loaded.result;

  useEffect(() => {
    // Nothing saved yet – the carousel renders nothing either way, so there is
    // no request to make.
    if (isLoading || seedCount === 0) return;

    let isCurrent = true;
    const controller = new AbortController();
    const seeds = [watchlistSeeds, watchedSeeds] as const;
    const saved = new Set(
      [...watchlistSeeds, ...watchedSeeds].map((seed) => mediaItemKey(seed.id, seed.mediaType)),
    );

    const timer = setTimeout(async () => {
      try {
        const recommendations = await getWatchlistRecommendations(
          watchlistSeeds,
          watchedSeeds,
          controller.signal,
        );
        if (isCurrent && !controller.signal.aborted) {
          setLoaded((previous) => ({
            seeds, owner, settingsKey, attempt, failed: false,
            result: isSameAudience(previous, owner, settingsKey, attempt)
              ? keepInPlace(previous.result, recommendations, saved)
              : recommendations,
          }));
        }
      } catch (error) {
        if (!isCurrent || controller.signal.aborted) return;
        console.error("Error loading recommendations:", error);
        setLoaded((previous) =>
          // The picks already on screen are still this profile's, for these
          // settings. A refresh that failed is no reason to take them away.
          isSameAudience(previous, owner, settingsKey, attempt) &&
          previous.result.items.length > 0
            ? { ...previous, seeds }
            : { seeds, owner, settingsKey, attempt, failed: true, result: EMPTY_RESULT },
        );
      }
    }, REFRESH_DELAY_MS);

    // Superseded lists/settings and navigation release their queued work too.
    return () => {
      isCurrent = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [watchlistSeeds, watchedSeeds, seedCount, isLoading, owner, settingsKey, attempt]);

  if (isLoading || seedCount === 0) return null;

  if (isFetching && result.items.length === 0) {
    return <CarouselSkeleton titleWidth="w-64" />;
  }

  if (loaded.failed) {
    return (
      <LoadFailureNotice
        compact
        title="Could not load recommendations"
        description="Recommendations or streaming availability could not be checked. Your saved lists are still here."
        onRetry={() => setAttempt((n) => n + 1)}
      />
    );
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

interface Loaded {
  seeds: readonly [RecommendationSeed[], RecommendationSeed[]] | null;
  owner: string;
  settingsKey: string;
  attempt: number;
  failed: boolean;
  result: RecommendationsResult;
}

/**
 * Whether loaded picks were built for this profile, settings and attempt, and
 * differ – if at all – only in the lists, which the profile itself edited.
 * A first load has no picks to keep, and a retry starts from a failure.
 */
function isSameAudience(
  loaded: Loaded,
  owner: string,
  settingsKey: string,
  attempt: number,
): boolean {
  return loaded.seeds !== null &&
    loaded.owner === owner &&
    loaded.settingsKey === settingsKey &&
    loaded.attempt === attempt;
}

/**
 * Fold a refreshed result into the one on screen without reshuffling it.
 *
 * Cards that are still recommended keep their places, and so does any card
 * that is now saved or watched – the one the visitor just acted on, which
 * would otherwise vanish from under the pointer, its button showing the new
 * state instead. Cards no longer recommended leave, and new picks join at the
 * end: the row is every fresh pick, plus the cards acted on while it was up.
 */
function keepInPlace(
  shown: RecommendationsResult,
  fresh: RecommendationsResult,
  saved: Set<string>,
): RecommendationsResult {
  const freshKeys = new Set(fresh.items.map((item) => mediaItemKey(item.id, item.media_type)));
  const kept = shown.items.filter((item) => {
    const key = mediaItemKey(item.id, item.media_type);
    return freshKeys.has(key) || saved.has(key);
  });
  const keptKeys = new Set(kept.map((item) => mediaItemKey(item.id, item.media_type)));
  const added = fresh.items.filter(
    (item) => !keptKeys.has(mediaItemKey(item.id, item.media_type)),
  );

  return { items: [...kept, ...added], basedOn: fresh.basedOn };
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
