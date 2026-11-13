"use client";

/**
 * Writes a matched import into this browser's stores.
 *
 * Additive, always. An import never removes a title, never lowers a list and
 * never replaces a score the visitor gave here themselves – it is run by
 * someone bringing years of history from elsewhere into an app they may have
 * already started using, and the one thing it must not do is cost them what
 * they did here. That also makes it safe to run twice: the second time finds
 * everything already there.
 *
 * The one thing it does take away follows the app's own rule: a title marked
 * watched leaves the watchlist, as it does when the visitor marks one watched
 * by hand (`watched-actions.ts`).
 *
 * Shaped like `rateTitleAndMarkWatched`: one lock, every store read strictly
 * before anything is written – an unreadable store refuses the import whole
 * rather than being overwritten by the empty list rendering falls back to –
 * and then the saves, in an order where stopping part-way leaves nothing
 * contradicting anything else.
 */

import { withProfileRosterLock } from "@/lib/profile-roster-lock";
import { isProfileStorageOwnerAvailable, withProfileStorage } from "@/lib/profile-storage";
import { MAX_ITEMS_PER_LIST } from "@/lib/media-list";
import { getWatchlist, saveWatchlist, type WatchlistItem } from "@/lib/watchlist";
import { getWatched, saveWatched, type WatchedItem } from "@/lib/watched";
import { getRatingsSnapshot, isRatingValue, saveRatings, type Ratings } from "@/lib/ratings";
import {
  getEpisodeProgress,
  saveEpisodeProgress,
  setSeasonWatched,
  watchedInSeason,
  type EpisodeProgress,
} from "@/lib/episode-progress";
import { mediaItemKey } from "@/lib/utils";
import type { ResolvedEntry } from "./resolve";

export interface ImportCounts {
  /** Titles put on the watchlist. */
  watchlistAdded: number;
  /** Titles added to the watched history. */
  watchedAdded: number;
  /** Scores recorded. */
  ratingsAdded: number;
  /** Scores left alone because the visitor had already scored the title here. */
  ratingsKept: number;
  /** Episodes ticked, and across how many series. */
  episodesTicked: number;
  showsTracked: number;
  /** Titles that left the watchlist because the import says they were watched. */
  movedOffWatchlist: number;
  /** Titles a full list had no room for. */
  watchlistFull: number;
  watchedFull: number;
}

export type ImportOutcome =
  | { status: "ok"; counts: ImportCounts }
  /**
   * The browser refused a write part-way. `saved` names what was stored before
   * it did; running the import again once there is room finishes it.
   */
  | { status: "partial"; counts: ImportCounts; saved: ImportStore[] }
  | { status: "profile-unavailable" | "unreadable" | "failed" };

export type ImportStore = "watched" | "ratings" | "episodes" | "watchlist";

const EMPTY_COUNTS: ImportCounts = {
  watchlistAdded: 0,
  watchedAdded: 0,
  ratingsAdded: 0,
  ratingsKept: 0,
  episodesTicked: 0,
  showsTracked: 0,
  movedOffWatchlist: 0,
  watchlistFull: 0,
  watchedFull: 0,
};

interface Plan {
  watchlist: WatchlistItem[];
  watched: WatchedItem[];
  ratings: Ratings;
  progress: EpisodeProgress;
  counts: ImportCounts;
}

/** Newest first, which is the order both lists are kept in. */
function byDateDescending<T>(items: T[], dateOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => (dateOf(a) < dateOf(b) ? 1 : dateOf(a) > dateOf(b) ? -1 : 0));
}

/**
 * What the stores should hold after the import – worked out from what they
 * hold now, without touching them. Exported for the tests, which is where the
 * rules above are pinned.
 */
export function planImport(
  current: { watchlist: WatchlistItem[]; watched: WatchedItem[]; ratings: Ratings; progress: EpisodeProgress },
  resolved: ResolvedEntry[],
  now: string = new Date().toISOString(),
): Plan {
  const counts = { ...EMPTY_COUNTS };
  const listed = new Set(current.watchlist.map((item) => mediaItemKey(item.id, item.mediaType)));
  const seen = new Set(current.watched.map((item) => mediaItemKey(item.id, item.mediaType)));

  const newWatched: WatchedItem[] = [];
  const newListed: WatchlistItem[] = [];
  const ratings: Ratings = { ...current.ratings };
  let progress = current.progress;
  const shows = new Set<number>();

  for (const { title, entry } of resolved) {
    const key = mediaItemKey(title.id, title.mediaType);
    const base = {
      id: title.id,
      title: title.title,
      mediaType: title.mediaType,
      posterPath: title.posterPath,
      voteAverage: title.voteAverage,
      releaseDate: title.releaseDate,
    };

    const hasScore = entry.rating !== undefined && isRatingValue(entry.rating);
    // Scoring a title is having watched it – the rule the rating panel keeps.
    const isWatched = Boolean(entry.watched) || hasScore;

    if (hasScore) {
      if (ratings[key]) {
        counts.ratingsKept++;
      } else {
        ratings[key] = { rating: entry.rating!, ratedAt: entry.ratedAt ?? entry.watchedAt ?? now };
        counts.ratingsAdded++;
      }
    }

    if (isWatched && !seen.has(key)) {
      seen.add(key);
      newWatched.push({ ...base, watchedAt: entry.watchedAt ?? entry.ratedAt ?? now });
    }

    let ticked = 0;
    if (title.mediaType === "tv" && entry.episodes?.length) {
      const show = { tvId: title.id, name: title.title, posterPath: title.posterPath };
      const bySeason = new Map<number, number[]>();
      for (const { season, episode } of entry.episodes) {
        bySeason.set(season, [...(bySeason.get(season) ?? []), episode]);
      }
      for (const [season, episodes] of bySeason) {
        const before = watchedInSeason(progress, title.id, season).length;
        progress = setSeasonWatched(progress, show, season, episodes, true, now);
        ticked += watchedInSeason(progress, title.id, season).length - before;
      }
      if (ticked > 0) shows.add(title.id);
      counts.episodesTicked += ticked;
    }

    // A series with episodes ticked is in progress, which is past "to watch":
    // it shows up under Continue Watching instead.
    const inProgress = title.mediaType === "tv" && Boolean(entry.episodes?.length);
    if ((entry.watchlist || entry.followed) && !isWatched && !inProgress && !seen.has(key) && !listed.has(key)) {
      listed.add(key);
      newListed.push({ ...base, addedAt: entry.watchlistAt ?? now });
    }
  }
  counts.showsTracked = shows.size;

  // Lists are capped, and the cap applies to what is added, never to what is
  // already there. The most recent of the incoming titles get the room.
  const watchedRoom = Math.max(0, MAX_ITEMS_PER_LIST - current.watched.length);
  const keptWatched = byDateDescending(newWatched, (item) => item.watchedAt).slice(0, watchedRoom);
  counts.watchedAdded = keptWatched.length;
  counts.watchedFull = newWatched.length - keptWatched.length;
  const watched = byDateDescending([...keptWatched, ...current.watched], (item) => item.watchedAt);

  // The titles this import marked watched leave the watchlist. Only those: a
  // title that was somehow on both lists before is not this import's to tidy.
  const nowWatched = new Set(keptWatched.map((item) => mediaItemKey(item.id, item.mediaType)));
  const stillListed = current.watchlist.filter(
    (item) => !nowWatched.has(mediaItemKey(item.id, item.mediaType)),
  );
  counts.movedOffWatchlist = current.watchlist.length - stillListed.length;

  const listRoom = Math.max(0, MAX_ITEMS_PER_LIST - stillListed.length);
  const keptListed = byDateDescending(newListed, (item) => item.addedAt).slice(0, listRoom);
  counts.watchlistAdded = keptListed.length;
  counts.watchlistFull = newListed.length - keptListed.length;
  const watchlist = byDateDescending([...keptListed, ...stillListed], (item) => item.addedAt);

  return { watchlist, watched, ratings, progress, counts };
}

export function applyImport(
  profileId: string,
  resolved: ResolvedEntry[],
): Promise<ImportOutcome> {
  return withProfileRosterLock<ImportOutcome>(() => withProfileStorage(profileId, () => {
    if (!isProfileStorageOwnerAvailable(profileId)) return { status: "profile-unavailable" };

    let plan: Plan;
    try {
      plan = planImport(
        {
          watchlist: getWatchlist({ strict: true }),
          watched: getWatched({ strict: true }),
          ratings: getRatingsSnapshot({ strict: true }),
          progress: getEpisodeProgress({ strict: true }),
        },
        resolved,
      );
    } catch (error) {
      console.error("Error reading this browser's lists before an import:", error);
      return { status: "unreadable" };
    }

    const { counts } = plan;
    const saved: ImportStore[] = [];
    // The history first: scores and the watchlist's removals both lean on it.
    const steps: [ImportStore, boolean, () => boolean][] = [
      ["watched", counts.watchedAdded > 0, () => saveWatched(plan.watched)],
      ["ratings", counts.ratingsAdded > 0, () => saveRatings(plan.ratings)],
      ["episodes", counts.episodesTicked > 0, () => saveEpisodeProgress(plan.progress)],
      [
        "watchlist",
        counts.watchlistAdded > 0 || counts.movedOffWatchlist > 0,
        () => saveWatchlist(plan.watchlist),
      ],
    ];

    for (const [store, changed, save] of steps) {
      if (!changed) continue;
      if (!save()) return saved.length > 0 ? { status: "partial", counts, saved } : { status: "failed" };
      saved.push(store);
    }
    return { status: "ok", counts };
  }), { status: "failed" });
}
