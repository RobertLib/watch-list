import { describe, expect, it } from "vitest";
import { PUZZLE_POOL } from "./daily-puzzle-pool";
import { pickPuzzleForDay } from "./daily-puzzle-data";
import { PUZZLE_EPOCH } from "./daily-puzzle";
import { shiftDate } from "./dates";

/**
 * The pool is data, so what is worth testing about it is the shape the schedule
 * assumes. `pickPuzzleForDay` walks it by a stride chosen to be coprime with its
 * length, which visits every entry exactly once per cycle – a property that
 * quietly depends on the pool itself: a duplicated id turns "every film once"
 * into one film twice, and `isCorrectGuess` then accepts the right answer on the
 * wrong day.
 *
 * Appending is the normal way this file changes, and none of these care how long
 * it is. They care that whoever appends keeps the invariants.
 */

describe("PUZZLE_POOL", () => {
  it("is big enough for the rotation to be worth having", () => {
    // Under a year and the schedule starts repeating within a season, which is
    // the point at which a daily game stops feeling daily.
    expect(PUZZLE_POOL.length).toBeGreaterThan(365);
  });

  it("names every film exactly once", () => {
    const ids = PUZZLE_POOL.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // The file says it is ordered by id, and the reason matters: any other order
  // is a ranking, and a ranking of films by how well known they are is exactly
  // what the puzzle must not ship.
  it("stays ordered by id", () => {
    const ids = PUZZLE_POOL.map((entry) => entry.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it("holds only ids TMDB could answer for", () => {
    for (const entry of PUZZLE_POOL) {
      expect(Number.isInteger(entry.id)).toBe(true);
      expect(entry.id).toBeGreaterThan(0);
    }
  });

  // The title is the fallback when TMDB cannot be reached, so a blank one is a
  // board with nothing on it.
  it("carries a usable title for every entry", () => {
    for (const entry of PUZZLE_POOL) {
      expect(typeof entry.title).toBe("string");
      expect(entry.title.trim()).not.toBe("");
      expect(entry.title).toBe(entry.title.trim());
    }
  });
});

describe("PUZZLE_POOL – as the schedule walks it", () => {
  it("serves every film once before serving any of them twice", () => {
    const seen = new Set<number>();

    for (let offset = 0; offset < PUZZLE_POOL.length; offset++) {
      const puzzle = pickPuzzleForDay(shiftDate(PUZZLE_EPOCH, offset));
      expect(puzzle).not.toBeNull();
      seen.add(puzzle!.entry.id);
    }

    // One full cycle, every film, no repeats – which only holds while the ids
    // above are unique and the stride stays coprime with the length.
    expect(seen.size).toBe(PUZZLE_POOL.length);
  });

  it("gives the same day the same film every time it is asked", () => {
    const day = shiftDate(PUZZLE_EPOCH, 200);

    expect(pickPuzzleForDay(day)).toEqual(pickPuzzleForDay(day));
  });
});
