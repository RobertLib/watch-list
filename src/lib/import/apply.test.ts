// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProfileLockManager } from "@/test/profile-locks";
import { MAX_ITEMS_PER_LIST } from "@/lib/media-list";
import { getActiveProfileId } from "@/lib/profiles";
import { withProfileStorage } from "@/lib/profile-storage";
import { RATINGS_STORAGE_KEY, getRatingsSnapshot } from "@/lib/ratings";
import { WATCHED_STORAGE_KEY, getWatched, type WatchedItem } from "@/lib/watched";
import { WATCHLIST_STORAGE_KEY, getWatchlist, type WatchlistItem } from "@/lib/watchlist";
import { EPISODE_PROGRESS_STORAGE_KEY, getEpisodeProgress } from "@/lib/episode-progress";
import { applyImport, planImport } from "./apply";
import type { ResolvedEntry } from "./resolve";
import type { ImportEntry } from "./types";

const NOW = "2026-11-13T12:00:00.000Z";

function film(id: number, entry: Partial<ImportEntry> = {}): ResolvedEntry {
  return {
    title: {
      mediaType: "movie", id, title: `Film ${id}`, posterPath: `/p${id}.jpg`,
      releaseDate: "2000-01-01", voteAverage: 7,
    },
    entry: { ref: { mediaType: "movie", tmdbId: id }, ...entry },
  };
}

function show(id: number, entry: Partial<ImportEntry> = {}): ResolvedEntry {
  return {
    title: {
      mediaType: "tv", id, title: `Show ${id}`, posterPath: null,
      releaseDate: "2010-01-01", voteAverage: 8,
    },
    entry: { ref: { mediaType: "tv", tmdbId: id }, ...entry },
  };
}

const listed = (id: number, addedAt = "2026-01-01T00:00:00.000Z"): WatchlistItem => ({
  id, title: `Film ${id}`, mediaType: "movie", posterPath: null, voteAverage: 7,
  releaseDate: "2000-01-01", addedAt,
});
const seen = (id: number, watchedAt = "2026-01-01T00:00:00.000Z"): WatchedItem => ({
  id, title: `Film ${id}`, mediaType: "movie", posterPath: null, voteAverage: 7,
  releaseDate: "2000-01-01", watchedAt,
});

const EMPTY = { watchlist: [], watched: [], ratings: {}, progress: {} };

describe("planImport", () => {
  it("puts a to-watch title on the watchlist, dated as it was there", () => {
    const plan = planImport(EMPTY, [film(1, { watchlist: true, watchlistAt: "2020-05-05T00:00:00.000Z" })], NOW);

    expect(plan.watchlist).toEqual([
      {
        id: 1, title: "Film 1", mediaType: "movie", posterPath: "/p1.jpg", voteAverage: 7,
        releaseDate: "2000-01-01", addedAt: "2020-05-05T00:00:00.000Z",
      },
    ]);
    expect(plan.counts).toMatchObject({ watchlistAdded: 1, watchedAdded: 0 });
  });

  it("adds a watched title to the history and keeps it off the watchlist", () => {
    const plan = planImport(
      EMPTY,
      [film(1, { watched: true, watchedAt: "2021-01-01T00:00:00.000Z", watchlist: true })],
      NOW,
    );

    expect(plan.watched.map((item) => [item.id, item.watchedAt])).toEqual([[1, "2021-01-01T00:00:00.000Z"]]);
    expect(plan.watchlist).toEqual([]);
  });

  // The rule the rating panel keeps: scoring a title is having watched it.
  it("records a score and marks the title watched", () => {
    const plan = planImport(EMPTY, [film(1, { rating: 9, ratedAt: "2022-02-02T00:00:00.000Z" })], NOW);

    expect(plan.ratings).toEqual({ "movie-1": { rating: 9, ratedAt: "2022-02-02T00:00:00.000Z" } });
    expect(plan.watched.map((item) => item.id)).toEqual([1]);
    expect(plan.counts).toMatchObject({ ratingsAdded: 1, watchedAdded: 1 });
  });

  // Someone bringing years of history in must not lose what they did here.
  it("never replaces a score the visitor gave here", () => {
    const current = { ...EMPTY, ratings: { "movie-1": { rating: 4, ratedAt: "2026-06-01T00:00:00.000Z" } } };
    const plan = planImport(current, [film(1, { rating: 9 })], NOW);

    expect(plan.ratings["movie-1"].rating).toBe(4);
    expect(plan.counts).toMatchObject({ ratingsAdded: 0, ratingsKept: 1 });
  });

  it("leaves what is already on a list exactly as it is", () => {
    const current = { ...EMPTY, watchlist: [listed(1)], watched: [seen(2)] };
    const plan = planImport(
      current,
      [film(1, { watchlist: true, watchlistAt: "2001-01-01T00:00:00.000Z" }), film(2, { watched: true, watchedAt: "2001-01-01T00:00:00.000Z" })],
      NOW,
    );

    expect(plan.watchlist).toEqual(current.watchlist);
    expect(plan.watched).toEqual(current.watched);
    expect(plan.counts).toMatchObject({ watchlistAdded: 0, watchedAdded: 0 });
  });

  // What the app does when a title is marked watched by hand.
  it("takes a title off the watchlist when the import says it was watched", () => {
    const current = { ...EMPTY, watchlist: [listed(1), listed(2)] };
    const plan = planImport(current, [film(1, { watched: true })], NOW);

    expect(plan.watchlist.map((item) => item.id)).toEqual([2]);
    expect(plan.counts.movedOffWatchlist).toBe(1);
  });

  it("does not tidy a title that was on both lists before the import", () => {
    const current = { ...EMPTY, watchlist: [listed(1)], watched: [seen(1)] };
    const plan = planImport(current, [film(2, { watchlist: true })], NOW);

    expect(plan.watchlist.map((item) => item.id).sort()).toEqual([1, 2]);
    expect(plan.counts.movedOffWatchlist).toBe(0);
  });

  it("ticks a series' episodes and keeps it off the watchlist", () => {
    const plan = planImport(
      EMPTY,
      [
        show(10, {
          followed: true,
          episodes: [{ season: 1, episode: 2 }, { season: 1, episode: 1 }, { season: 2, episode: 1 }],
        }),
      ],
      NOW,
    );

    expect(plan.progress["10"]).toMatchObject({
      tvId: 10, name: "Show 10", seasons: { "1": [1, 2], "2": [1] },
    });
    // In progress, which is past "to watch".
    expect(plan.watchlist).toEqual([]);
    expect(plan.counts).toMatchObject({ episodesTicked: 3, showsTracked: 1 });
  });

  it("counts only the episodes that were not already ticked", () => {
    const first = planImport(EMPTY, [show(10, { episodes: [{ season: 1, episode: 1 }] })], NOW);
    const second = planImport(
      { ...EMPTY, progress: first.progress },
      [show(10, { episodes: [{ season: 1, episode: 1 }, { season: 1, episode: 2 }] })],
      NOW,
    );

    expect(second.counts).toMatchObject({ episodesTicked: 1, showsTracked: 1 });
    expect(second.progress["10"].seasons).toEqual({ "1": [1, 2] });
  });

  // TV Time's "followed": in the library, nothing said about watching.
  it("puts a followed series with nothing watched on the watchlist", () => {
    const plan = planImport(EMPTY, [show(10, { followed: true })], NOW);

    expect(plan.watchlist.map((item) => [item.id, item.mediaType])).toEqual([[10, "tv"]]);
  });

  it("keeps both lists newest first", () => {
    const current = { ...EMPTY, watched: [seen(1, "2024-01-01T00:00:00.000Z")] };
    const plan = planImport(
      current,
      [
        film(2, { watched: true, watchedAt: "2025-01-01T00:00:00.000Z" }),
        film(3, { watched: true, watchedAt: "2023-01-01T00:00:00.000Z" }),
      ],
      NOW,
    );

    expect(plan.watched.map((item) => item.id)).toEqual([2, 1, 3]);
  });

  it("dates what the export did not", () => {
    const plan = planImport(EMPTY, [film(1, { watched: true }), film(2, { watchlist: true })], NOW);

    expect(plan.watched[0].watchedAt).toBe(NOW);
    expect(plan.watchlist[0].addedAt).toBe(NOW);
  });

  // The cap is on what comes in, never on what is there.
  it("fills a list to its limit with the most recent, and says what did not fit", () => {
    const current = {
      ...EMPTY,
      watched: Array.from({ length: MAX_ITEMS_PER_LIST - 1 }, (_, i) => seen(1000 + i)),
    };
    const plan = planImport(
      current,
      [
        film(1, { watched: true, watchedAt: "2020-01-01T00:00:00.000Z" }),
        film(2, { watched: true, watchedAt: "2025-01-01T00:00:00.000Z" }),
      ],
      NOW,
    );

    expect(plan.watched).toHaveLength(MAX_ITEMS_PER_LIST);
    expect(plan.watched.some((item) => item.id === 2)).toBe(true);
    expect(plan.watched.some((item) => item.id === 1)).toBe(false);
    expect(plan.counts).toMatchObject({ watchedAdded: 1, watchedFull: 1 });
  });

  it("ignores a score that is not one", () => {
    const plan = planImport(EMPTY, [film(1, { rating: 11 }), film(2, { rating: 0 })], NOW);

    expect(plan.ratings).toEqual({});
    expect(plan.watched).toEqual([]);
  });

  it("changes nothing when there is nothing to add", () => {
    const current = { ...EMPTY, watchlist: [listed(1)] };
    const plan = planImport(current, [], NOW);

    expect(plan.watchlist).toEqual(current.watchlist);
    expect(Object.values(plan.counts).every((count) => count === 0)).toBe(true);
  });
});

describe("applyImport", () => {
  let profileId: string;

  beforeEach(() => {
    vi.stubGlobal("navigator", { locks: createProfileLockManager() });
    window.localStorage.clear();
    profileId = getActiveProfileId();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  const read = () =>
    withProfileStorage(profileId, () => ({
      watchlist: getWatchlist(),
      watched: getWatched(),
      ratings: getRatingsSnapshot(),
      progress: getEpisodeProgress(),
    }));

  it("writes every list the import touched", async () => {
    const outcome = await applyImport(profileId, [
      film(1, { watchlist: true }),
      film(2, { watched: true }),
      film(3, { rating: 8 }),
      show(10, { episodes: [{ season: 1, episode: 1 }] }),
    ]);

    expect(outcome).toMatchObject({
      status: "ok",
      counts: { watchlistAdded: 1, watchedAdded: 2, ratingsAdded: 1, episodesTicked: 1, showsTracked: 1 },
    });
    const stored = read();
    expect(stored.watchlist.map((item) => item.id)).toEqual([1]);
    expect(stored.watched.map((item) => item.id).sort()).toEqual([2, 3]);
    expect(stored.ratings["movie-3"].rating).toBe(8);
    expect(stored.progress["10"].seasons).toEqual({ "1": [1] });
  });

  // An import only ever adds, so it can be run again after a failure.
  it("finds everything already there the second time", async () => {
    const batch = [film(1, { watchlist: true }), film(2, { rating: 7 })];
    await applyImport(profileId, batch);
    const before = read();

    const outcome = await applyImport(profileId, batch);

    expect(outcome).toMatchObject({
      status: "ok",
      counts: { watchlistAdded: 0, watchedAdded: 0, ratingsAdded: 0, ratingsKept: 1 },
    });
    expect(read()).toEqual(before);
  });

  it("leaves a store the import does not touch unwritten", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await applyImport(profileId, [film(1, { watchlist: true })]);

    const written = setItem.mock.calls.map(([key]) => key);
    expect(written.some((key) => key.includes(WATCHLIST_STORAGE_KEY))).toBe(true);
    expect(written.some((key) => key.includes(RATINGS_STORAGE_KEY))).toBe(false);
    expect(written.some((key) => key.includes(EPISODE_PROGRESS_STORAGE_KEY))).toBe(false);
  });

  // Rendering falls back to an empty list for a store it cannot parse; an
  // import must not save over the only copy with that fallback plus its own.
  it("refuses the whole import when a list in this browser cannot be read", async () => {
    await applyImport(profileId, [film(1, { watched: true })]);
    const key = Object.keys(window.localStorage).find((name) => name.includes(WATCHED_STORAGE_KEY))!;
    window.localStorage.setItem(key, "{not json");

    const outcome = await applyImport(profileId, [film(2, { watchlist: true })]);

    expect(outcome).toEqual({ status: "unreadable" });
    expect(window.localStorage.getItem(key)).toBe("{not json");
    expect(read().watchlist).toEqual([]);
  });

  it("says so when the browser stores nothing", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    await expect(applyImport(profileId, [film(1, { watchlist: true })])).resolves.toEqual({
      status: "failed",
    });
  });

  it("reports what was saved when the browser runs out of room part-way", async () => {
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key.includes(RATINGS_STORAGE_KEY)) {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      }
      setItem.call(this, key, value);
    });

    const outcome = await applyImport(profileId, [film(1, { rating: 8 }), film(2, { watchlist: true })]);

    // The history went in; the score did not; the watchlist was never reached.
    expect(outcome).toMatchObject({ status: "partial", saved: ["watched"] });
    expect(read().watched.map((item) => item.id)).toEqual([1]);
    expect(read().watchlist).toEqual([]);
  });
});
