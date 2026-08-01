import { describe, expect, it } from "vitest";
import {
  buildStatsShareText,
  EMPTY_STATS,
  formatWatchTime,
  summarize,
  summarizeYear,
  yearsCovered,
  type StatsInput,
  type TitleFacts,
  type WatchedEntry,
} from "./stats";

const watched = (
  id: number,
  overrides: Partial<WatchedEntry> = {},
): WatchedEntry => ({
  id,
  mediaType: "movie",
  title: `Title ${id}`,
  posterPath: null,
  watchedAt: "2026-03-04T10:00:00.000Z",
  ...overrides,
});

const facts = (
  id: number,
  overrides: Partial<TitleFacts> = {},
): [string, TitleFacts] => {
  const mediaType = overrides.mediaType ?? "movie";
  return [
    `${mediaType}-${id}`,
    {
      id,
      mediaType,
      runtime: 100,
      genres: ["Drama"],
      year: "1999",
      ...overrides,
    },
  ];
};

function input(overrides: Partial<StatsInput> = {}): StatsInput {
  return {
    watched: [],
    episodesByShow: {},
    ratings: {},
    facts: {},
    ...overrides,
  };
}

describe("summarize", () => {
  it("has nothing to say about an empty record", () => {
    expect(summarize(input())).toEqual(EMPTY_STATS);
  });

  it("counts films and series apart", () => {
    const stats = summarize(
      input({
        watched: [watched(1), watched(2, { mediaType: "tv" })],
      }),
    );

    expect(stats.totalTitles).toBe(2);
    expect(stats.films).toBe(1);
    expect(stats.series).toBe(1);
  });

  it("adds up film runtimes", () => {
    const stats = summarize(
      input({
        watched: [watched(1), watched(2)],
        facts: Object.fromEntries([
          facts(1, { runtime: 120 }),
          facts(2, { runtime: 90 }),
        ]),
      }),
    );

    expect(stats.minutes).toBe(210);
  });

  it("counts a series by the episodes actually ticked", () => {
    const stats = summarize(
      input({
        watched: [watched(5, { mediaType: "tv" })],
        episodesByShow: { 5: 12 },
        facts: Object.fromEntries([
          facts(5, { mediaType: "tv", runtime: 45 }),
        ]),
      }),
    );

    expect(stats.minutes).toBe(540);
    expect(stats.episodes).toBe(12);
  });

  it("counts episodes of a series that was never marked watched", () => {
    const stats = summarize(
      input({
        episodesByShow: { 7: 4 },
        facts: Object.fromEntries([facts(7, { mediaType: "tv", runtime: 30 })]),
      }),
    );

    expect(stats.episodes).toBe(4);
    expect(stats.minutes).toBe(120);
  });

  it("does not count a series twice when it is both ticked and watched", () => {
    const stats = summarize(
      input({
        watched: [watched(5, { mediaType: "tv" })],
        episodesByShow: { 5: 10 },
        facts: Object.fromEntries([facts(5, { mediaType: "tv", runtime: 50 })]),
      }),
    );

    expect(stats.minutes).toBe(500);
  });

  it("invents no runtime for a title TMDB has none for, and says so", () => {
    const stats = summarize(
      input({
        watched: [watched(1), watched(2)],
        facts: Object.fromEntries([
          facts(1, { runtime: 100 }),
          facts(2, { runtime: null }),
        ]),
      }),
    );

    expect(stats.minutes).toBe(100);
    expect(stats.titlesWithoutRuntime).toBe(1);
  });

  it("counts a title with no facts at all as unmeasured", () => {
    const stats = summarize(input({ watched: [watched(1)] }));

    expect(stats.titlesWithoutRuntime).toBe(1);
    expect(stats.minutes).toBe(0);
  });

  it("ranks genres by how often they come up", () => {
    const stats = summarize(
      input({
        watched: [watched(1), watched(2), watched(3)],
        facts: Object.fromEntries([
          facts(1, { genres: ["Drama", "Thriller"] }),
          facts(2, { genres: ["Thriller"] }),
          facts(3, { genres: ["Thriller"] }),
        ]),
      }),
    );

    expect(stats.topGenres[0]).toEqual({ name: "Thriller", count: 3 });
    expect(stats.topGenres[1]).toEqual({ name: "Drama", count: 1 });
  });

  it("groups release years into decades, in order", () => {
    const stats = summarize(
      input({
        watched: [watched(1), watched(2)],
        facts: Object.fromEntries([
          facts(1, { year: "1994" }),
          facts(2, { year: "2007" }),
        ]),
      }),
    );

    expect(stats.decades.map((entry) => entry.name)).toEqual(["1990s", "2000s"]);
  });

  it("builds a histogram of the viewer's own scores", () => {
    const stats = summarize(
      input({
        watched: [watched(1), watched(2)],
        ratings: {
          "movie-1": { rating: 8, ratedAt: "" },
          "movie-2": { rating: 10, ratedAt: "" },
        },
      }),
    );

    expect(stats.ratingHistogram[7]).toBe(1);
    expect(stats.ratingHistogram[9]).toBe(1);
    expect(stats.averageRating).toBe(9);
    expect(stats.ratedCount).toBe(2);
  });

  it("has no average when nothing has been scored", () => {
    expect(summarize(input({ watched: [watched(1)] })).averageRating).toBeNull();
  });

  it("counts titles by the year they were finished", () => {
    const stats = summarize(
      input({
        watched: [
          watched(1, { watchedAt: "2025-06-01T00:00:00.000Z" }),
          watched(2, { watchedAt: "2026-01-02T00:00:00.000Z" }),
          watched(3, { watchedAt: "2026-04-02T00:00:00.000Z" }),
        ],
      }),
    );

    expect(stats.byYear).toEqual({ "2025": 1, "2026": 2 });
    expect(stats.busiestYear).toBe("2026");
  });

  it("ignores a timestamp it cannot read rather than inventing a year", () => {
    const stats = summarize(input({ watched: [watched(1, { watchedAt: "" })] }));

    expect(stats.byYear).toEqual({});
    expect(stats.busiestYear).toBeNull();
  });
});

describe("summarizeYear", () => {
  it("keeps only what was finished that year", () => {
    const stats = summarizeYear(
      input({
        watched: [
          watched(1, { watchedAt: "2025-06-01T00:00:00.000Z" }),
          watched(2, { watchedAt: "2026-01-02T00:00:00.000Z" }),
        ],
      }),
      "2026",
    );

    expect(stats.totalTitles).toBe(1);
  });

  it("leaves undated episode ticks out of a year's totals", () => {
    const stats = summarizeYear(
      input({
        watched: [watched(1, { watchedAt: "2026-01-02T00:00:00.000Z" })],
        episodesByShow: { 9: 30 },
      }),
      "2026",
    );

    expect(stats.episodes).toBe(0);
  });
});

describe("yearsCovered", () => {
  it("lists the years, newest first, without repeats", () => {
    expect(
      yearsCovered(
        input({
          watched: [
            watched(1, { watchedAt: "2025-06-01T00:00:00.000Z" }),
            watched(2, { watchedAt: "2026-01-02T00:00:00.000Z" }),
            watched(3, { watchedAt: "2026-08-02T00:00:00.000Z" }),
          ],
        }),
      ),
    ).toEqual(["2026", "2025"]);
  });
});

describe("formatWatchTime", () => {
  it("uses hours until they stop being readable", () => {
    expect(formatWatchTime(60)).toBe("1 hour");
    expect(formatWatchTime(300)).toBe("5 hours");
  });

  it("switches to days once it is a lot", () => {
    expect(formatWatchTime(60 * 72)).toBe("3 days of screen time");
  });

  it("says nothing grand about nothing", () => {
    expect(formatWatchTime(0)).toBe("no time yet");
  });
});

describe("buildStatsShareText", () => {
  it("leaves out the parts there is no number for", () => {
    const text = buildStatsShareText(
      { ...EMPTY_STATS, films: 3 },
      "2026",
      "https://x.test",
    );

    expect(text).toContain("3 films");
    expect(text).not.toContain("episodes");
    expect(text).toContain("https://x.test");
  });
});
