import { describe, expect, it } from "vitest";
import { TOTAL_ACHIEVEMENTS, achievementsFor } from "./achievements";
import type { WatchStats } from "./stats";

const EMPTY_STATS: WatchStats = {
  totalTitles: 0,
  films: 0,
  series: 0,
  episodes: 0,
  minutes: 0,
  titlesWithoutRuntime: 0,
  topGenres: [],
  decades: [],
  ratingHistogram: Array.from({ length: 10 }, () => 0),
  averageRating: null,
  ratedCount: 0,
  byYear: {},
  busiestYear: null,
};

function statsWith(overrides: Partial<WatchStats>): WatchStats {
  return { ...EMPTY_STATS, ...overrides };
}

function byId(stats: WatchStats, id: string) {
  const found = achievementsFor(stats).find(
    (achievement) => achievement.id === id,
  );
  if (!found) throw new Error(`No achievement called ${id}`);
  return found;
}

describe("achievementsFor", () => {
  it("returns every achievement, earned or not", () => {
    const all = achievementsFor(EMPTY_STATS);

    expect(all).toHaveLength(TOTAL_ACHIEVEMENTS);
    expect(all.every((achievement) => !achievement.earned)).toBe(true);
  });

  it("earns one exactly at its target, not one short", () => {
    expect(byId(statsWith({ totalTitles: 9 }), "first-ten").earned).toBe(false);
    expect(byId(statsWith({ totalTitles: 10 }), "first-ten").earned).toBe(true);
  });

  it("caps progress at the target so a bar cannot overflow", () => {
    const achievement = byId(statsWith({ totalTitles: 4000 }), "century");

    expect(achievement.earned).toBe(true);
    expect(achievement.progress).toEqual({ current: 100, target: 100 });
  });

  // The marathon is the one measure that is not simply a count off the stats.
  it("counts the marathon in whole hours, rounding down", () => {
    expect(byId(statsWith({ minutes: 99 * 60 + 59 }), "marathon")).toMatchObject(
      { earned: false, progress: { current: 99, target: 100 } },
    );
    expect(byId(statsWith({ minutes: 100 * 60 }), "marathon").earned).toBe(true);
  });

  it("measures breadth by how many genres and decades appear", () => {
    const tallies = (count: number) =>
      Array.from({ length: count }, (_, i) => ({ name: `n${i}`, count: 1 }));

    const stats = statsWith({
      topGenres: tallies(6),
      decades: tallies(4),
    });

    expect(byId(stats, "omnivore").earned).toBe(true);
    expect(byId(stats, "time-traveller").earned).toBe(true);
  });

  it("gives every achievement a distinct id", () => {
    const ids = achievementsFor(EMPTY_STATS).map(
      (achievement) => achievement.id,
    );

    expect(new Set(ids).size).toBe(ids.length);
  });
});
