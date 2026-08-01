import { describe, expect, it } from "vitest";
import { PUZZLE_POOL } from "./daily-puzzle-pool";
import { pickPuzzleForDay } from "./daily-puzzle-server";
import {
  HINT_LADDER,
  IMAGE_STEPS,
  MAX_GUESSES,
  PUZZLE_EPOCH,
  daysBetween,
  imageStepForGuessCount,
  isDayString,
  puzzleNumberForDay,
  todayUtc,
  unlockedHints,
} from "./daily-puzzle";

describe("the pool", () => {
  it("holds enough films for months without a repeat", () => {
    expect(PUZZLE_POOL.length).toBeGreaterThan(300);
  });

  it("has no duplicate ids, which would make one film come up twice a cycle", () => {
    const ids = new Set(PUZZLE_POOL.map((entry) => entry.id));

    expect(ids.size).toBe(PUZZLE_POOL.length);
  });

  it("has a usable id and title on every entry", () => {
    for (const entry of PUZZLE_POOL) {
      expect(Number.isInteger(entry.id) && entry.id > 0).toBe(true);
      expect(entry.title.length).toBeGreaterThan(0);
    }
  });
});

describe("isDayString", () => {
  it("accepts a plain date and rejects anything else", () => {
    expect(isDayString("2026-08-01")).toBe(true);
    expect(isDayString("2026-8-1")).toBe(false);
    expect(isDayString("2026-08-01T00:00:00Z")).toBe(false);
    expect(isDayString(20260801)).toBe(false);
    expect(isDayString(undefined)).toBe(false);
  });
});

describe("todayUtc", () => {
  it("reads the UTC day, not the local one", () => {
    // Late evening in UTC+2 is still the same UTC day; a local read would be off
    // by one and turn the puzzle over at the wrong moment.
    expect(todayUtc(new Date("2026-08-01T23:30:00.000Z"))).toBe("2026-08-01");
    expect(todayUtc(new Date("2026-08-02T00:30:00.000Z"))).toBe("2026-08-02");
  });
});

describe("daysBetween", () => {
  it("counts whole days in both directions", () => {
    expect(daysBetween("2026-08-01", "2026-08-08")).toBe(7);
    expect(daysBetween("2026-08-08", "2026-08-01")).toBe(-7);
    expect(daysBetween("2026-08-01", "2026-08-01")).toBe(0);
  });

  it("crosses a leap day", () => {
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
  });
});

describe("puzzleNumberForDay", () => {
  it("numbers the epoch as puzzle one", () => {
    expect(puzzleNumberForDay(PUZZLE_EPOCH)).toBe(1);
  });

  it("advances by one a day", () => {
    expect(puzzleNumberForDay("2026-08-02")).toBe(2);
    expect(puzzleNumberForDay("2026-09-01")).toBe(32);
  });
});

describe("pickPuzzleForDay", () => {
  it("gives the same film every time it is asked", () => {
    const first = pickPuzzleForDay("2026-08-01");
    const second = pickPuzzleForDay("2026-08-01");

    expect(first).toEqual(second);
    expect(first?.entry.id).toBeGreaterThan(0);
  });

  it("refuses a day it cannot read", () => {
    expect(pickPuzzleForDay("tomorrow")).toBeNull();
    expect(pickPuzzleForDay("")).toBeNull();
    expect(pickPuzzleForDay(undefined as never)).toBeNull();
  });

  it("visits every film in the pool before repeating any", () => {
    const length = PUZZLE_POOL.length;
    const seen = new Set<number>();

    for (let offset = 0; offset < length; offset++) {
      const day = new Date(Date.parse(`${PUZZLE_EPOCH}T00:00:00.000Z`));
      day.setUTCDate(day.getUTCDate() + offset);
      const puzzle = pickPuzzleForDay(day.toISOString().slice(0, 10));
      seen.add(puzzle!.entry.id);
    }

    // A stride sharing a factor with the pool length would circle a fraction of
    // it forever, and this is what catches that.
    expect(seen.size).toBe(length);
  });

  it("does not put neighbouring films on neighbouring days", () => {
    const a = pickPuzzleForDay("2026-08-01")!;
    const b = pickPuzzleForDay("2026-08-02")!;
    const indexA = PUZZLE_POOL.findIndex((e) => e.id === a.entry.id);
    const indexB = PUZZLE_POOL.findIndex((e) => e.id === b.entry.id);

    expect(Math.abs(indexA - indexB)).toBeGreaterThan(1);
  });

  it("works for a day before the game launched", () => {
    const puzzle = pickPuzzleForDay("2020-01-01");

    // Negative day numbers must still land inside the pool.
    expect(puzzle?.entry.id).toBeGreaterThan(0);
    expect(puzzle?.number).toBeLessThan(0);
  });
});

describe("unlockedHints", () => {
  it("gives nothing away on the first guess", () => {
    expect(unlockedHints(0)).toEqual([]);
  });

  it("adds one rung per wrong guess, weakest first", () => {
    expect(unlockedHints(1)).toEqual(["decade"]);
    expect(unlockedHints(3)).toEqual(["decade", "genres", "runtime"]);
  });

  it("keeps the cast until last, since it usually settles the answer", () => {
    expect(HINT_LADDER.at(-1)).toBe("cast");
    expect(unlockedHints(MAX_GUESSES - 1)).not.toContain("cast");
  });

  it("cannot be pushed past the ladder by an inflated guess count", () => {
    expect(unlockedHints(900)).toEqual(HINT_LADDER);
    expect(unlockedHints(-5)).toEqual([]);
  });
});

describe("imageStepForGuessCount", () => {
  it("starts at the blurriest and sharpens with each guess", () => {
    expect(imageStepForGuessCount(0)).toBe(0);
    expect(imageStepForGuessCount(2)).toBe(2);
  });

  it("clamps to the sizes that exist", () => {
    expect(imageStepForGuessCount(99)).toBe(IMAGE_STEPS.length - 1);
    expect(imageStepForGuessCount(-1)).toBe(0);
  });
});
