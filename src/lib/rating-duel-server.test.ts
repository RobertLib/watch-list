import { beforeEach, describe, expect, it, vi } from "vitest";

// The pool and the TMDB reads are both mocked: what is under test is the rule
// that the challenger's score never leaves the server before the guess is in,
// and neither a real network nor 398 real films is needed to check that.
vi.mock("./daily-puzzle-pool", () => ({
  PUZZLE_POOL: [
    { id: 1, title: "One" },
    { id: 2, title: "Two" },
    { id: 3, title: "Three" },
  ],
}));

const RATINGS: Record<number, number> = { 1: 8.4, 2: 6.1, 3: 8.4 };

vi.mock("./tmdb-cache", () => ({
  getCachedMovieDetails: vi.fn(async (id: number) => ({
    title: `Film ${id}`,
    release_date: "1999-10-15",
    poster_path: `/poster${id}.jpg`,
    backdrop_path: `/backdrop${id}.jpg`,
    vote_average: RATINGS[id] ?? 0,
  })),
}));

const { pickRatingDuel, sanitizeSeenIds, settleRatingDuel } = await import(
  "./rating-duel-server"
);

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
  });

  it("never sends the challenger's score", async () => {
    const duel = await pickRatingDuel([], true);

    expect(duel).not.toBeNull();
    // The whole game rests on this: a rating in the payload is an answer in the
    // network tab.
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
});

describe("settleRatingDuel", () => {
  it("settles a correct 'higher'", async () => {
    // Film 2 scores 6.1, film 1 scores 8.4.
    const result = await settleRatingDuel(2, 1, "higher");

    expect(result).toEqual({ correct: true, challengerRating: 8.4 });
  });

  it("settles a wrong 'higher'", async () => {
    const result = await settleRatingDuel(1, 2, "higher");

    expect(result?.correct).toBe(false);
  });

  it("settles a correct 'lower'", async () => {
    expect((await settleRatingDuel(1, 2, "lower"))?.correct).toBe(true);
  });

  it("gives a tie to the player", async () => {
    // Films 1 and 3 both score 8.4, and the interface rounds the difference away
    // anyway – punishing that would be arbitrary.
    expect((await settleRatingDuel(1, 3, "higher"))?.correct).toBe(true);
    expect((await settleRatingDuel(1, 3, "lower"))?.correct).toBe(true);
  });

  it("reveals the score that was being withheld", async () => {
    expect((await settleRatingDuel(1, 2, "lower"))?.challengerRating).toBe(6.1);
  });

  it("refuses anything that is not a guess", async () => {
    expect(await settleRatingDuel(1, 2, "sideways")).toBeNull();
    expect(await settleRatingDuel(1, 2, undefined)).toBeNull();
  });

  it("refuses an id that is not one", async () => {
    expect(await settleRatingDuel(-1, 2, "higher")).toBeNull();
    expect(await settleRatingDuel(1, "2", "higher")).toBeNull();
  });
});
