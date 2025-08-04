import { describe, expect, it } from "vitest";
import {
  clearRating,
  getRatingFor,
  isRatingValue,
  sanitizeRatings,
  setRating,
  type Ratings,
} from "./ratings";

const NOW = "2026-08-01T12:00:00.000Z";

const ratings: Ratings = {
  "movie-550": { rating: 9, ratedAt: NOW },
  "tv-1396": { rating: 10, ratedAt: NOW },
};

describe("isRatingValue", () => {
  it("accepts whole scores from one to ten", () => {
    expect(isRatingValue(1)).toBe(true);
    expect(isRatingValue(10)).toBe(true);
  });

  it("rejects anything outside that", () => {
    expect(isRatingValue(0)).toBe(false);
    expect(isRatingValue(11)).toBe(false);
    expect(isRatingValue(7.5)).toBe(false);
    expect(isRatingValue("8")).toBe(false);
    expect(isRatingValue(NaN)).toBe(false);
    expect(isRatingValue(undefined)).toBe(false);
  });
});

describe("sanitizeRatings", () => {
  it("keeps well-formed scores", () => {
    expect(sanitizeRatings(ratings)).toEqual(ratings);
  });

  it("returns nothing for anything that is not a map", () => {
    expect(sanitizeRatings(undefined)).toEqual({});
    expect(sanitizeRatings([])).toEqual({});
    expect(sanitizeRatings("{}")).toEqual({});
  });

  it("drops keys that do not name a title", () => {
    // Without the media type a score is not addressable: 550 is both a film and a
    // series on TMDB.
    expect(
      sanitizeRatings({
        "550": { rating: 9 },
        "person-550": { rating: 9 },
        "movie-abc": { rating: 9 },
        "movie-": { rating: 9 },
      }),
    ).toEqual({});
  });

  it("drops entries whose score is unusable", () => {
    expect(
      sanitizeRatings({
        "movie-1": { rating: 0 },
        "movie-2": { rating: 11 },
        "movie-3": { rating: "9" },
        "movie-4": {},
        "movie-5": null,
      }),
    ).toEqual({});
  });

  it("keeps a score whose timestamp is unusable", () => {
    // The score is the part worth keeping; only the date is dropped.
    expect(
      sanitizeRatings({ "movie-550": { rating: 8, ratedAt: "yesterday" } }),
    ).toEqual({ "movie-550": { rating: 8, ratedAt: "" } });
  });
});

describe("getRatingFor", () => {
  it("finds a score by id and media type", () => {
    expect(getRatingFor(ratings, 550, "movie")).toBe(9);
    expect(getRatingFor(ratings, 1396, "tv")).toBe(10);
  });

  it("does not confuse a film with a series of the same id", () => {
    expect(getRatingFor(ratings, 550, "tv")).toBeNull();
  });

  it("returns null for an unrated title", () => {
    expect(getRatingFor(ratings, 999, "movie")).toBeNull();
    expect(getRatingFor({}, 550, "movie")).toBeNull();
  });
});

describe("setRating", () => {
  it("adds a score", () => {
    expect(setRating({}, 550, "movie", 7, NOW)).toEqual({
      "movie-550": { rating: 7, ratedAt: NOW },
    });
  });

  it("replaces an existing score", () => {
    const next = setRating(ratings, 550, "movie", 4, NOW);

    expect(next["movie-550"].rating).toBe(4);
    expect(next["tv-1396"].rating).toBe(10);
  });

  it("refuses a score it could not read back", () => {
    expect(setRating(ratings, 550, "movie", 0, NOW)).toBe(ratings);
    expect(setRating(ratings, 550, "movie", 7.5, NOW)).toBe(ratings);
  });

  it("leaves the previous map untouched", () => {
    setRating(ratings, 999, "movie", 5, NOW);

    expect(ratings["movie-999"]).toBeUndefined();
  });
});

describe("clearRating", () => {
  it("removes one score and leaves the rest", () => {
    const next = clearRating(ratings, 550, "movie");

    expect(next["movie-550"]).toBeUndefined();
    expect(next["tv-1396"].rating).toBe(10);
  });

  it("is a no-op for a title that was never rated", () => {
    expect(clearRating(ratings, 999, "movie")).toEqual(ratings);
  });
});
