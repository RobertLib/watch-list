import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The pool and the TMDB reads are both mocked: the UI receives the challenger's
// score only after a guess, without a real network or 398 real films.
vi.mock("./daily-puzzle-pool", () => ({
  PUZZLE_POOL: [
    { id: 1, title: "One" },
    { id: 2, title: "Two" },
    { id: 3, title: "Three" },
  ],
}));

const RATINGS: Record<number, number> = {
  1: 8.4,
  2: 6.1,
  3: 8.4,
  4: 8.41,
  5: 8.44,
  6: 8.46,
};

vi.mock("./tmdb-cache", () => ({
  getCachedMovieDetails: vi.fn(async (id: number) => ({
    title: `Film ${id}`,
    release_date: "1999-10-15",
    poster_path: `/poster${id}.jpg`,
    backdrop_path: `/backdrop${id}.jpg`,
    vote_average: RATINGS[id] ?? 0,
  })),
}));

const { getCachedMovieDetails } = await import("./tmdb-cache");
const { pickRatingDuel, sanitizeSeenIds, settleRatingDuel } = await import(
  "./rating-duel-data"
);

afterEach(() => vi.restoreAllMocks());

describe("sanitizeSeenIds", () => {
  it("keeps positive integers and drops the rest", () => {
    expect(sanitizeSeenIds([1, -2, "3", 4.5, 6])).toEqual([1, 6]);
  });

  it("returns nothing for a non-array", () => {
    expect(sanitizeSeenIds("1,2,3")).toEqual([]);
    expect(sanitizeSeenIds(null)).toEqual([]);
  });
});

describe("pickRatingDuel", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.mocked(getCachedMovieDetails).mockClear();
  });

  it("never sends the challenger's score", async () => {
    const duel = await pickRatingDuel([], true);

    expect(duel).not.toBeNull();
    // Keep the UI's reveal separate from the opening pair.
    expect(duel!.challenger).not.toHaveProperty("rating");
    expect(JSON.stringify(duel!.challenger)).not.toContain("8.4");
  });

  it("sends the champion's score, which is the one being compared against", async () => {
    const duel = await pickRatingDuel([], true);

    expect(typeof duel!.champion!.rating).toBe("number");
  });

  it("picks two different films", async () => {
    const duel = await pickRatingDuel([], true);

    expect(duel!.champion!.id).not.toBe(duel!.challenger.id);
  });

  it("skips films already seen this run", async () => {
    const duel = await pickRatingDuel([1, 2], false);

    expect(duel!.challenger.id).toBe(3);
  });

  it("fetches no champion once a run is under way", async () => {
    const duel = await pickRatingDuel([], false);

    expect(duel!.champion).toBeNull();
  });

  it("gives up rather than repeating once the pool is exhausted", async () => {
    expect(await pickRatingDuel([1, 2, 3], false)).toBeNull();
  });

  it.each([
    new Error("TMDB API error: 401 Unauthorized"),
    new Error("TMDB API error: 403 Forbidden"),
    new Error("TMDB API error: 429 Too Many Requests"),
    new Error("TMDB API error: 500 Internal Server Error"),
    new DOMException("Request timed out", "TimeoutError"),
    new TypeError("Failed to fetch"),
  ])("stops selection after a global lookup failure: %s", async (error) => {
    vi.mocked(getCachedMovieDetails).mockRejectedValueOnce(error);

    await expect(pickRatingDuel([], true)).rejects.toBe(error);
    expect(getCachedMovieDetails).toHaveBeenCalledTimes(1);
  });
});

describe("settleRatingDuel", () => {
  it("settles a correct 'higher'", async () => {
    const result = await settleRatingDuel(6.1, 1, "higher");

    expect(result).toEqual({ correct: true, challengerRating: 8.4 });
  });

  it("settles a wrong 'higher'", async () => {
    const result = await settleRatingDuel(8.4, 2, "higher");

    expect(result?.correct).toBe(false);
  });

  it("settles a correct 'lower'", async () => {
    expect((await settleRatingDuel(8.4, 2, "lower"))?.correct).toBe(true);
  });

  it("gives a tie to the player", async () => {
    expect((await settleRatingDuel(8.4, 3, "higher"))?.correct).toBe(true);
    expect((await settleRatingDuel(8.4, 3, "lower"))?.correct).toBe(true);
  });

  it("reveals the score that was being withheld", async () => {
    expect((await settleRatingDuel(8.4, 2, "lower"))?.challengerRating).toBe(6.1);
  });

  it("accepts either direction when distinct averages display as a tie", async () => {
    expect((await settleRatingDuel(8.41, 5, "higher"))?.correct).toBe(true);
    expect((await settleRatingDuel(8.41, 5, "lower"))?.correct).toBe(true);
    expect((await settleRatingDuel(8.44, 4, "higher"))?.correct).toBe(true);
    expect((await settleRatingDuel(8.44, 4, "lower"))?.correct).toBe(true);
  });

  it("still rejects the wrong direction when the displayed scores differ", async () => {
    expect((await settleRatingDuel(8.41, 6, "lower"))?.correct).toBe(false);
    expect((await settleRatingDuel(8.46, 4, "higher"))?.correct).toBe(false);
  });

  it("refuses anything that is not a guess", async () => {
    expect(await settleRatingDuel(8.4, 2, "sideways")).toBeNull();
    expect(await settleRatingDuel(8.4, 2, undefined)).toBeNull();
  });

  it("refuses an id that is not one", async () => {
    expect(await settleRatingDuel(8.4, -1, "higher")).toBeNull();
    expect(await settleRatingDuel(8.4, "2", "higher")).toBeNull();
  });

  it.each([undefined, null, "8.4", NaN, Infinity, -1, 0, 0.4, 10.1])(
    "refuses an invalid displayed champion score: %s",
    async (rating) => {
      expect(await settleRatingDuel(rating, 2, "higher")).toBeNull();
    },
  );
});
