import { describe, expect, it } from "vitest";
import {
  airedEpisodes,
  resolveUpNext,
  sanitizeContinueWatchingSeeds,
} from "./continue-watching";

const seasons = [
  { season_number: 0, episode_count: 4 },
  { season_number: 1, episode_count: 3 },
  { season_number: 2, episode_count: 3 },
];

describe("sanitizeContinueWatchingSeeds", () => {
  it("keeps a well-formed entry", () => {
    expect(
      sanitizeContinueWatchingSeeds([
        {
          tvId: 1396,
          name: "Breaking Bad",
          posterPath: "/poster.jpg",
          seasons: { "1": [2, 1] },
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ]),
    ).toEqual([
      {
        tvId: 1396,
        name: "Breaking Bad",
        posterPath: "/poster.jpg",
        // Sorted, so the aired-order walk does not depend on click order.
        seasons: { "1": [1, 2] },
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("rejects a payload that is not an array", () => {
    expect(sanitizeContinueWatchingSeeds(undefined)).toEqual([]);
    expect(sanitizeContinueWatchingSeeds(null)).toEqual([]);
    expect(sanitizeContinueWatchingSeeds("[]")).toEqual([]);
    expect(sanitizeContinueWatchingSeeds({ tvId: 1396 })).toEqual([]);
  });

  it("drops entries without a usable show id", () => {
    expect(
      sanitizeContinueWatchingSeeds([
        { tvId: 0, seasons: { "1": [1] } },
        { tvId: -1, seasons: { "1": [1] } },
        { tvId: 1.5, seasons: { "1": [1] } },
        { tvId: "1396", seasons: { "1": [1] } },
        { seasons: { "1": [1] } },
      ]),
    ).toEqual([]);
  });

  it("drops entries with nothing ticked", () => {
    expect(
      sanitizeContinueWatchingSeeds([
        { tvId: 1396, seasons: {} },
        { tvId: 1399, seasons: { "1": [] } },
        { tvId: 1400, seasons: { abc: [1] } },
        { tvId: 1401, seasons: { "-1": [1] } },
        { tvId: 1402, seasons: [1, 2] },
        { tvId: 1403 },
      ]),
    ).toEqual([]);
  });

  it("keeps season 0, where TMDB puts the specials", () => {
    const [seed] = sanitizeContinueWatchingSeeds([
      { tvId: 1396, seasons: { "0": [1] } },
    ]);

    expect(seed.seasons).toEqual({ "0": [1] });
  });

  it("drops episode numbers that are not usable", () => {
    const [seed] = sanitizeContinueWatchingSeeds([
      { tvId: 1396, seasons: { "1": [1, -2, 1.5, "3", null, 5, 5] } },
    ]);

    expect(seed.seasons).toEqual({ "1": [1, 5] });
  });

  it("orders by last activity and caps the number of shows", () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      tvId: index + 1,
      seasons: { "1": [1] },
      // Earlier ids get older timestamps, so the newest ids should survive.
      updatedAt: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    }));

    const seeds = sanitizeContinueWatchingSeeds(many);

    expect(seeds).toHaveLength(12);
    expect(seeds[0].tvId).toBe(20);
    expect(seeds.at(-1)?.tvId).toBe(9);
  });

  it("de-duplicates repeated shows", () => {
    const seeds = sanitizeContinueWatchingSeeds([
      { tvId: 1396, seasons: { "1": [1] }, updatedAt: "2026-01-02" },
      { tvId: 1396, seasons: { "1": [2] }, updatedAt: "2026-01-01" },
    ]);

    expect(seeds).toHaveLength(1);
    expect(seeds[0].seasons).toEqual({ "1": [1] });
  });
});

describe("airedEpisodes", () => {
  it("lists the regular run in broadcast order and leaves specials out", () => {
    expect(
      airedEpisodes(seasons, { season_number: 2, episode_number: 3 }),
    ).toEqual([
      { seasonNumber: 1, episodeNumber: 1 },
      { seasonNumber: 1, episodeNumber: 2 },
      { seasonNumber: 1, episodeNumber: 3 },
      { seasonNumber: 2, episodeNumber: 1 },
      { seasonNumber: 2, episodeNumber: 2 },
      { seasonNumber: 2, episodeNumber: 3 },
    ]);
  });

  it("stops at the last episode that actually aired", () => {
    expect(
      airedEpisodes(seasons, { season_number: 2, episode_number: 1 }),
    ).toEqual([
      { seasonNumber: 1, episodeNumber: 1 },
      { seasonNumber: 1, episodeNumber: 2 },
      { seasonNumber: 1, episodeNumber: 3 },
      { seasonNumber: 2, episodeNumber: 1 },
    ]);
  });

  it("treats a show with nothing aired as having no episodes", () => {
    expect(airedEpisodes(seasons, null)).toEqual([]);
  });

  it("orders seasons numerically rather than by TMDB's array order", () => {
    const shuffled = [
      { season_number: 2, episode_count: 1 },
      { season_number: 1, episode_count: 1 },
    ];

    expect(
      airedEpisodes(shuffled, { season_number: 2, episode_number: 1 }),
    ).toEqual([
      { seasonNumber: 1, episodeNumber: 1 },
      { seasonNumber: 2, episodeNumber: 1 },
    ]);
  });

  it("falls back to the season counts when only a special aired last", () => {
    expect(
      airedEpisodes(
        [{ season_number: 1, episode_count: 2 }],
        { season_number: 0, episode_number: 1 },
      ),
    ).toEqual([
      { seasonNumber: 1, episodeNumber: 1 },
      { seasonNumber: 1, episodeNumber: 2 },
    ]);
  });
});

describe("resolveUpNext", () => {
  const details = {
    seasons,
    last_episode_to_air: { season_number: 2, episode_number: 3 },
  };

  it("offers the first unticked episode", () => {
    expect(
      resolveUpNext({ seasons: { "1": [1, 2] } }, details),
    ).toEqual({
      next: { seasonNumber: 1, episodeNumber: 3 },
      watchedCount: 2,
      airedCount: 6,
    });
  });

  it("crosses into the next season once one is finished", () => {
    expect(resolveUpNext({ seasons: { "1": [1, 2, 3] } }, details)?.next).toEqual(
      { seasonNumber: 2, episodeNumber: 1 },
    );
  });

  it("fills a gap before moving on", () => {
    // Someone who skipped an episode is offered the one they skipped.
    expect(
      resolveUpNext({ seasons: { "1": [1, 3], "2": [1] } }, details)?.next,
    ).toEqual({ seasonNumber: 1, episodeNumber: 2 });
  });

  it("returns nothing once every aired episode is ticked", () => {
    expect(
      resolveUpNext({ seasons: { "1": [1, 2, 3], "2": [1, 2, 3] } }, details),
    ).toBeNull();
  });

  it("ignores ticked specials", () => {
    const resolution = resolveUpNext({ seasons: { "0": [1, 2] } }, details);

    expect(resolution?.next).toEqual({ seasonNumber: 1, episodeNumber: 1 });
    // A special is not part of the run, so it must not fill the progress bar.
    expect(resolution?.watchedCount).toBe(0);
  });

  it("ignores ticks past the end of the aired run", () => {
    const resolution = resolveUpNext(
      { seasons: { "1": [1, 2, 3], "2": [1, 2, 3, 4, 5] } },
      details,
    );

    expect(resolution).toBeNull();
  });

  it("counts only aired ticks when a season shrinks upstream", () => {
    const resolution = resolveUpNext(
      { seasons: { "1": [1, 2], "2": [1, 2, 3] } },
      {
        seasons,
        // The show is mid-season two: only its first episode has aired.
        last_episode_to_air: { season_number: 2, episode_number: 1 },
      },
    );

    expect(resolution).toEqual({
      next: { seasonNumber: 1, episodeNumber: 3 },
      watchedCount: 3,
      airedCount: 4,
    });
  });

  it("returns nothing for a show that has not aired yet", () => {
    expect(
      resolveUpNext(
        { seasons: { "1": [1] } },
        { seasons, last_episode_to_air: null },
      ),
    ).toBeNull();
  });
});
