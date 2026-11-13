import { describe, expect, it } from "vitest";
import { capEntries, summariseEntries } from "./summary";
import type { ImportEntry } from "./types";

const entry = (id: number, rest: Partial<ImportEntry> = {}): ImportEntry => ({
  ref: { mediaType: "movie", tmdbId: id },
  ...rest,
});

describe("summariseEntries", () => {
  it("counts what an import would add, each title in the one place it goes", () => {
    const summary = summariseEntries([
      entry(1, { watchlist: true }),
      entry(2, { watched: true }),
      // Scored: watched, and a rating.
      entry(3, { rating: 8 }),
      // On the watchlist there, but watched: not something still to watch.
      entry(4, { watchlist: true, watched: true }),
      // A series in progress is neither to watch nor watched.
      entry(5, { followed: true, episodes: [{ season: 1, episode: 1 }, { season: 1, episode: 2 }] }),
      entry(6, { followed: true }),
    ]);

    expect(summary).toEqual({ toWatch: 2, watched: 3, ratings: 1, shows: 1, episodes: 2 });
  });

  it("counts nothing in nothing", () => {
    expect(summariseEntries([])).toEqual({ toWatch: 0, watched: 0, ratings: 0, shows: 0, episodes: 0 });
  });
});

describe("capEntries", () => {
  it("leaves an import that fits exactly as it is", () => {
    const entries = [entry(1, { watched: true }), entry(2, { watchlist: true })];

    expect(capEntries(entries, 5)).toEqual({ entries, dropped: 0 });
  });

  // A watchlist is the reason to move at all; ten-year-old history is not.
  it("keeps what is still to watch, then series in progress, then scores, then recent history", () => {
    const { entries, dropped } = capEntries(
      [
        entry(1, { watched: true, watchedAt: "2015-01-01T00:00:00.000Z" }),
        entry(2, { watched: true, watchedAt: "2025-01-01T00:00:00.000Z" }),
        entry(3, { rating: 9, ratedAt: "2010-01-01T00:00:00.000Z" }),
        entry(4, { episodes: [{ season: 1, episode: 1 }] }),
        entry(5, { watchlist: true }),
      ],
      4,
    );

    expect(entries.map(({ ref }) => ref.tmdbId)).toEqual([5, 4, 3, 2]);
    expect(dropped).toBe(1);
  });
});
