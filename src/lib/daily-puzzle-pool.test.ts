import { describe, expect, it } from "vitest";
import { PUZZLE_POOL, PUZZLE_POOL_GENERATIONS } from "./daily-puzzle-pool";
import { pickPuzzleForDay } from "./daily-puzzle-data";
import { PUZZLE_EPOCH, isDayString } from "./daily-puzzle";
import { shiftDate } from "./dates";

/**
 * The pool is data, so what is worth testing about it is the shape the schedule
 * assumes. `pickPuzzleForDay` walks a prefix of it by a stride chosen to be
 * coprime with that prefix's length, which visits every entry exactly once per
 * cycle – a property that quietly depends on the pool itself: a duplicated id
 * turns "every film once" into one film twice, and `isCorrectGuess` then accepts
 * the right answer on the wrong day.
 *
 * Appending is the normal way this file changes, and it is the change with the
 * most to break: every day already played reads a prefix of this list, so the
 * tests below pin those prefixes and check that the schedule grew along with
 * the films. They care that whoever appends keeps the invariants, not how long
 * the pool is.
 */

/**
 * A short, stable digest of a run of ids – FNV-1a over the ids as text. Enough to
 * notice any insertion, removal or reordering without pinning 398 numbers.
 */
function fingerprint(ids: number[]): string {
  let hash = 0x811c9dc5;
  for (const char of ids.join(",")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * The prefix each generation walks, as it was when the generation shipped.
 *
 * Add a row when adding a generation – the failure below prints the value to
 * pin. A row never changes afterwards: if one stops matching, an existing film
 * moved, and every day that generation served now has a different answer.
 */
const SEALED_PREFIXES: Record<number, string> = {
  398: "6ea2c048",
};

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
  // what the puzzle must not ship. Each generation's films are appended as a
  // block, so it is within a block that the order holds – a film with a low id
  // added later goes at the end with its block, never back among the old ones.
  it("stays ordered by id within each generation's block", () => {
    let start = 0;
    for (const { length } of PUZZLE_POOL_GENERATIONS) {
      const ids = PUZZLE_POOL.slice(start, length).map((entry) => entry.id);
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
      start = length;
    }
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

describe("PUZZLE_POOL_GENERATIONS", () => {
  /**
   * The check that catches an append on its own. The schedule only walks as far
   * as the last generation, so films added without one would never be served –
   * and the obvious "fix", stretching the last generation, is the one change
   * that rewrites every day it has already served.
   */
  it("covers the whole pool, so appended films come with a generation of their own", () => {
    expect(PUZZLE_POOL_GENERATIONS.at(-1)?.length).toBe(PUZZLE_POOL.length);
  });

  it("starts on the first day the game ran", () => {
    expect(PUZZLE_POOL_GENERATIONS[0]?.from).toBe(PUZZLE_EPOCH);
  });

  it("only ever moves forwards, in both date and length", () => {
    for (const [index, generation] of PUZZLE_POOL_GENERATIONS.entries()) {
      expect(isDayString(generation.from)).toBe(true);
      expect(Number.isInteger(generation.length)).toBe(true);
      expect(generation.length).toBeGreaterThan(2);

      const previous = PUZZLE_POOL_GENERATIONS[index - 1];
      if (!previous) continue;
      expect(generation.from > previous.from).toBe(true);
      expect(generation.length).toBeGreaterThan(previous.length);
    }
  });

  it.each(PUZZLE_POOL_GENERATIONS.map((generation) => [generation.length]))(
    "keeps the first %i films exactly as they were when they were scheduled",
    (length) => {
      const prefix = PUZZLE_POOL.slice(0, length).map((entry) => entry.id);

      expect(prefix).toHaveLength(length);
      expect(
        fingerprint(prefix),
        `pin this generation in SEALED_PREFIXES – ${length}: "${fingerprint(prefix)}"`,
      ).toBe(SEALED_PREFIXES[length]);
    },
  );
});

describe("PUZZLE_POOL – as the schedule walks it", () => {
  it("serves every film once before serving any of them twice", () => {
    // From the newest generation's first day, which is the walk that covers the
    // whole pool; an older generation strides through a shorter prefix.
    const latest = PUZZLE_POOL_GENERATIONS.at(-1)!;
    const seen = new Set<number>();

    for (let offset = 0; offset < PUZZLE_POOL.length; offset++) {
      const puzzle = pickPuzzleForDay(shiftDate(latest.from, offset));
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
