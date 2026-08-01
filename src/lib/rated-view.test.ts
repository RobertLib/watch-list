import { describe, expect, it } from "vitest";
import {
  isRatedSort,
  ratedRefs,
  sortRated,
  summarizeRated,
  type RatedRef,
} from "./rated-view";

const ref = (overrides: Partial<RatedRef> & { id: number }): RatedRef => ({
  mediaType: "movie",
  rating: 7,
  ratedAt: "2026-07-01T00:00:00.000Z",
  ...overrides,
});

describe("ratedRefs", () => {
  it("reads a score out of the stored map", () => {
    expect(
      ratedRefs({ "movie-550": { rating: 9, ratedAt: "2026-07-01" } }),
    ).toEqual([
      { id: 550, mediaType: "movie", rating: 9, ratedAt: "2026-07-01" },
    ]);
  });

  it("tells a film from a series with the same id", () => {
    const refs = ratedRefs({
      "movie-1": { rating: 8, ratedAt: "" },
      "tv-1": { rating: 4, ratedAt: "" },
    });

    expect(refs).toHaveLength(2);
    expect(refs.map((entry) => entry.mediaType).sort()).toEqual([
      "movie",
      "tv",
    ]);
  });

  it("skips a key it cannot read rather than guessing", () => {
    expect(
      ratedRefs({
        "550": { rating: 9, ratedAt: "" },
        "movie-550": { rating: 9, ratedAt: "" },
      }),
    ).toHaveLength(1);
  });

  it("has nothing to show for an empty store", () => {
    expect(ratedRefs({})).toEqual([]);
  });
});

describe("sortRated", () => {
  const refs = [
    ref({ id: 1, rating: 5, ratedAt: "2026-01-01T00:00:00.000Z" }),
    ref({ id: 2, rating: 10, ratedAt: "2026-06-01T00:00:00.000Z" }),
    ref({ id: 3, rating: 8, ratedAt: "2026-03-01T00:00:00.000Z" }),
  ];

  it("puts the best first by default", () => {
    expect(sortRated(refs, "score").map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it("can turn that around", () => {
    expect(sortRated(refs, "lowest").map((r) => r.id)).toEqual([1, 3, 2]);
  });

  it("orders by when it was scored", () => {
    expect(sortRated(refs, "recent").map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it("sorts an entry with no date last rather than first", () => {
    const withMissing = [
      ref({ id: 1, ratedAt: "" }),
      ref({ id: 2, ratedAt: "2026-06-01T00:00:00.000Z" }),
    ];

    expect(sortRated(withMissing, "recent").map((r) => r.id)).toEqual([2, 1]);
  });

  it("breaks a tie stably instead of shuffling between renders", () => {
    const tied = [ref({ id: 9, rating: 7 }), ref({ id: 4, rating: 7 })];

    expect(sortRated(tied, "score").map((r) => r.id)).toEqual([4, 9]);
  });

  it("does not sort in place", () => {
    const original = [ref({ id: 1, rating: 2 }), ref({ id: 2, rating: 9 })];
    sortRated(original, "score");

    expect(original.map((r) => r.id)).toEqual([1, 2]);
  });
});

describe("summarizeRated", () => {
  it("counts films and series apart and averages the scores", () => {
    const summary = summarizeRated([
      ref({ id: 1, rating: 8 }),
      ref({ id: 2, rating: 6, mediaType: "tv" }),
    ]);

    expect(summary).toEqual({ total: 2, films: 1, series: 1, average: 7 });
  });

  it("has no average with nothing rated", () => {
    expect(summarizeRated([])).toEqual({
      total: 0,
      films: 0,
      series: 0,
      average: null,
    });
  });
});

describe("isRatedSort", () => {
  it("accepts the orders that exist and nothing else", () => {
    expect(isRatedSort("score")).toBe(true);
    expect(isRatedSort("recent")).toBe(true);
    expect(isRatedSort("sideways")).toBe(false);
    expect(isRatedSort(null)).toBe(false);
  });
});
