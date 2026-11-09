import { describe, expect, it, vi } from "vitest";
import { shiftDate } from "./dates";
import { PUZZLE_EPOCH } from "./daily-puzzle";

/**
 * What growing the pool does to the schedule, with the pool grown for real.
 *
 * The bug this guards against: the walk's stride used to be derived from
 * `PUZZLE_POOL.length`, so a 399th film moved every day since the epoch onto a
 * different answer – including days whose boards sit finished in the archive,
 * marked against the old one. Here the pool gains a film and a generation that
 * starts after "today", and every day before that generation must keep its film.
 */

const NEXT_GENERATION = "2026-12-01";

const real = vi.hoisted(() => ({
  pool: [] as { id: number; title: string }[],
}));

vi.mock("./daily-puzzle-pool", async (importOriginal) => {
  const original = await importOriginal<typeof import("./daily-puzzle-pool")>();
  real.pool = original.PUZZLE_POOL;

  return {
    ...original,
    PUZZLE_POOL: [...original.PUZZLE_POOL, { id: 99_999_999, title: "Appended" }],
    PUZZLE_POOL_GENERATIONS: [
      ...original.PUZZLE_POOL_GENERATIONS,
      { from: NEXT_GENERATION, length: original.PUZZLE_POOL.length + 1 },
    ],
  };
});

const { pickPuzzleForDay } = await import("./daily-puzzle-data");

/** The schedule as it ran before any growth: one walk over the original pool. */
function originalAnswer(day: string): number {
  const length = real.pool.length;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  let stride = Math.floor(length * 0.618);
  while (stride > 1 && gcd(stride, length) !== 1) stride--;

  const number =
    Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${PUZZLE_EPOCH}T00:00:00Z`)) / 86_400_000) + 1;
  const index = (((number * stride) % length) + length) % length;

  return real.pool[index].id;
}

describe("growing the pool", () => {
  it("leaves every day before the new generation on the film it already had", () => {
    const changed: string[] = [];

    for (let day = shiftDate(PUZZLE_EPOCH, -30); day < NEXT_GENERATION; day = shiftDate(day, 1)) {
      if (pickPuzzleForDay(day)!.entry.id !== originalAnswer(day)) changed.push(day);
    }

    expect(changed).toEqual([]);
  });

  it("serves the grown pool from the new generation's first day", () => {
    const seen = new Set<number>();

    for (let offset = 0; offset < real.pool.length + 1; offset++) {
      seen.add(pickPuzzleForDay(shiftDate(NEXT_GENERATION, offset))!.entry.id);
    }

    // Every film once, the appended one included.
    expect(seen.size).toBe(real.pool.length + 1);
    expect(seen.has(99_999_999)).toBe(true);
  });
});
