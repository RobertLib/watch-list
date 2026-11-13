import { describe, expect, it } from "vitest";
import { EMPTY_STATS, type WatchStats } from "./stats";
import { buildYearCard, yearCardFilename } from "./year-card";

function stats(overrides: Partial<WatchStats> = {}): WatchStats {
  return {
    ...EMPTY_STATS,
    totalTitles: 84,
    films: 61,
    series: 23,
    episodes: 412,
    minutes: 9 * 24 * 60,
    topGenres: [
      { name: "Drama", count: 40 },
      { name: "Thriller", count: 20 },
      { name: "Comedy", count: 10 },
      { name: "Horror", count: 5 },
      { name: "Western", count: 1 },
    ],
    decades: [
      { name: "1990s", count: 10 },
      { name: "2010s", count: 50 },
      { name: "2020s", count: 24 },
    ],
    averageRating: 7.36,
    ratedCount: 31,
    ...overrides,
  };
}

describe("buildYearCard", () => {
  it("leads with the year and how many titles it held", () => {
    const card = buildYearCard(stats(), "2026", "watch-list.me");

    expect(card.heading).toBe("2026 in review");
    expect(card.total).toEqual({ value: "84", label: "titles finished" });
    expect(card.breakdown).toBe("61 films · 23 series");
    expect(card.site).toBe("watch-list.me");
  });

  it("shows the time, the episodes and the average score", () => {
    const card = buildYearCard(stats(), "2026", "watch-list.me");

    expect(card.tiles).toEqual([
      // The label carries "of screen time"; the value must not say it twice.
      { value: "9 days", label: "of screen time" },
      { value: "412", label: "episodes" },
      { value: "7.4", label: "average score" },
    ]);
  });

  it("scales each genre against the most-watched one", () => {
    const { genres } = buildYearCard(stats(), "2026", "watch-list.me");

    // Four, not all five.
    expect(genres.map((genre) => [genre.name, genre.share])).toEqual([
      ["Drama", 1],
      ["Thriller", 0.5],
      ["Comedy", 0.25],
      ["Horror", 0.125],
    ]);
  });

  // A tile that reads "no time yet" is a tile about nothing.
  it("leaves out what the year does not have, and fills in with the decade", () => {
    const card = buildYearCard(
      stats({ minutes: 0, episodes: 0, averageRating: null, series: 0 }),
      "2026",
      "watch-list.me",
    );

    expect(card.tiles).toEqual([{ value: "2010s", label: "favourite decade" }]);
    expect(card.breakdown).toBe("61 films");
  });

  it("writes one of anything in the singular", () => {
    const card = buildYearCard(
      stats({ totalTitles: 1, films: 1, series: 0, episodes: 1 }),
      "2026",
      "watch-list.me",
    );

    expect(card.total.label).toBe("title finished");
    expect(card.breakdown).toBe("1 film");
    expect(card.tiles).toContainEqual({ value: "1", label: "episode" });
  });

  it("groups thousands, as the page does", () => {
    const card = buildYearCard(stats({ totalTitles: 1204, episodes: 3100 }), "2026", "watch-list.me");

    expect(card.total.value).toBe("1,204");
    expect(card.tiles).toContainEqual({ value: "3,100", label: "episodes" });
  });

  it("draws no bars for a year with no genres known", () => {
    expect(buildYearCard(stats({ topGenres: [] }), "2026", "watch-list.me").genres).toEqual([]);
  });
});

describe("yearCardFilename", () => {
  it("names the file for its year", () => {
    expect(yearCardFilename("2026")).toBe("watchlist-2026-in-review.png");
  });
});
