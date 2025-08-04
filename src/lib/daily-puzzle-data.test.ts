import { describe, expect, it } from "vitest";
import { PUZZLE_POOL } from "./daily-puzzle-pool";
import { PUZZLE_EPOCH, puzzleNumberForDay } from "./daily-puzzle";
import { isCorrectGuess, pickPuzzleForDay } from "./daily-puzzle-data";

/**
 * Which film the daily puzzle lands on, and how the walk through the pool moves.
 *
 * The scheduling is the part worth pinning. It is a strided walk rather than a
 * shuffle – the stride is chosen coprime with the pool length so the walk visits
 * every entry before repeating any of them – and none of that is visible from
 * the outside until it goes wrong, at which point the symptom is the same film
 * twice in one week and nobody can say why.
 *
 * It is also the schedule everyone shares. Two players on the same date must get
 * the same film or the scores they compare mean nothing, which is what makes
 * determinism a property to assert rather than a comment.
 */

/** A day `n` puzzles after the epoch, as `YYYY-MM-DD`. */
function dayAfterEpoch(n: number): string {
  const epoch = new Date(`${PUZZLE_EPOCH}T00:00:00Z`);
  epoch.setUTCDate(epoch.getUTCDate() + n);
  return epoch.toISOString().slice(0, 10);
}

describe("pickPuzzleForDay", () => {
  it("refuses anything that is not a calendar day", () => {
    expect(pickPuzzleForDay("")).toBeNull();
    expect(pickPuzzleForDay("2026-13-01")).toBeNull();
    expect(pickPuzzleForDay("not-a-day")).toBeNull();
    expect(pickPuzzleForDay("2026/08/01")).toBeNull();
  });

  it("answers with a puzzle for a well-formed day", () => {
    const puzzle = pickPuzzleForDay(dayAfterEpoch(0));

    expect(puzzle).not.toBeNull();
    expect(puzzle!.day).toBe(dayAfterEpoch(0));
    expect(puzzle!.number).toBe(puzzleNumberForDay(dayAfterEpoch(0)));
    expect(PUZZLE_POOL).toContain(puzzle!.entry);
  });

  /** Everyone's puzzle is the same puzzle, or comparing results means nothing. */
  it("is deterministic for a given day", () => {
    const day = dayAfterEpoch(42);

    expect(pickPuzzleForDay(day)!.entry.id).toBe(
      pickPuzzleForDay(day)!.entry.id,
    );
  });

  it("gives consecutive days different films", () => {
    const a = pickPuzzleForDay(dayAfterEpoch(10))!;
    const b = pickPuzzleForDay(dayAfterEpoch(11))!;

    expect(a.entry.id).not.toBe(b.entry.id);
  });

  /**
   * The property the coprime stride buys: a full cycle of the pool before any
   * repeat. A stride sharing a factor with the length would circle a fraction of
   * the pool forever, and the game would feel much smaller than it is.
   */
  it("visits every entry in the pool before repeating one", () => {
    const seen = new Set<number>();

    for (let i = 0; i < PUZZLE_POOL.length; i++) {
      seen.add(pickPuzzleForDay(dayAfterEpoch(i))!.entry.id);
    }

    expect(seen.size).toBe(PUZZLE_POOL.length);
  });

  it("wraps back round after a full cycle", () => {
    const first = pickPuzzleForDay(dayAfterEpoch(0))!;
    const wrapped = pickPuzzleForDay(dayAfterEpoch(PUZZLE_POOL.length))!;

    expect(wrapped.entry.id).toBe(first.entry.id);
  });

  /**
   * The schedule runs on a signed day count, and `%` yields negatives in
   * JavaScript. A day before the epoch is reachable from the archive's own
   * arithmetic, and an index of -3 would throw rather than answer.
   */
  it("handles a day before the epoch without a negative index", () => {
    const puzzle = pickPuzzleForDay(dayAfterEpoch(-5));

    expect(puzzle).not.toBeNull();
    expect(PUZZLE_POOL).toContain(puzzle!.entry);
  });

  it("numbers the puzzle by its distance from the epoch", () => {
    expect(pickPuzzleForDay(dayAfterEpoch(0))!.number).toBe(
      puzzleNumberForDay(dayAfterEpoch(0)),
    );
    expect(pickPuzzleForDay(dayAfterEpoch(7))!.number).toBe(
      pickPuzzleForDay(dayAfterEpoch(0))!.number + 7,
    );
  });
});

describe("PUZZLE_POOL", () => {
  it("has enough films for the walk to be worth striding through", () => {
    expect(PUZZLE_POOL.length).toBeGreaterThan(2);
  });

  it("names each film once, so no day can duplicate another", () => {
    const ids = PUZZLE_POOL.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every entry a usable TMDB id", () => {
    const bad = PUZZLE_POOL.filter(
      (entry) => !Number.isInteger(entry.id) || entry.id < 1,
    );

    expect(bad).toEqual([]);
  });
});

describe("isCorrectGuess", () => {
  it("accepts the day's film", () => {
    const day = dayAfterEpoch(3);
    const puzzle = pickPuzzleForDay(day)!;

    expect(isCorrectGuess(day, puzzle.entry.id)).toBe(true);
  });

  it("rejects another film", () => {
    const day = dayAfterEpoch(3);
    const puzzle = pickPuzzleForDay(day)!;
    const other = PUZZLE_POOL.find((entry) => entry.id !== puzzle.entry.id)!;

    expect(isCorrectGuess(day, other.id)).toBe(false);
  });

  it("rejects a film that is right on a different day", () => {
    const day = dayAfterEpoch(3);
    const tomorrow = pickPuzzleForDay(dayAfterEpoch(4))!;

    expect(isCorrectGuess(day, tomorrow.entry.id)).toBe(false);
  });

  it("answers false rather than throwing for a malformed day", () => {
    expect(isCorrectGuess("not-a-day", 550)).toBe(false);
  });
});
