import { describe, expect, it } from "vitest";
import {
  isEpisodeWatched,
  removeShowProgress,
  sanitizeProgress,
  setSeasonWatched,
  showWatchedCount,
  toggleEpisode,
  type EpisodeProgress,
} from "./episode-progress";

const show = { tvId: 1396, name: "Breaking Bad", posterPath: "/poster.jpg" };
const NOW = "2026-08-01T12:00:00.000Z";

function progressWith(seasons: Record<string, number[]>): EpisodeProgress {
  return {
    "1396": { ...show, seasons, updatedAt: "2026-01-01T00:00:00.000Z" },
  };
}

describe("sanitizeProgress", () => {
  it("keeps a well-formed show", () => {
    const stored = progressWith({ "1": [1, 2] });

    expect(sanitizeProgress(stored)).toEqual(stored);
  });

  it("rejects anything that is not an object map", () => {
    expect(sanitizeProgress(undefined)).toEqual({});
    expect(sanitizeProgress(null)).toEqual({});
    expect(sanitizeProgress("{}")).toEqual({});
    expect(sanitizeProgress([{ tvId: 1396 }])).toEqual({});
  });

  it("drops shows left with nothing ticked, so un-ticking cleans up", () => {
    expect(
      sanitizeProgress({
        "1396": { ...show, seasons: {}, updatedAt: NOW },
        "1399": { ...show, tvId: 1399, seasons: { "1": [] }, updatedAt: NOW },
      }),
    ).toEqual({});
  });

  it("drops shows whose key is not a TMDB id", () => {
    expect(
      sanitizeProgress({
        abc: { ...show, seasons: { "1": [1] }, updatedAt: NOW },
        "0": { ...show, seasons: { "1": [1] }, updatedAt: NOW },
        "-5": { ...show, seasons: { "1": [1] }, updatedAt: NOW },
      }),
    ).toEqual({});
  });

  it("normalises episode numbers and keeps them sorted", () => {
    const cleaned = sanitizeProgress({
      "1396": {
        ...show,
        seasons: { "1": [3, 1, 1, "2", null, -4, 2.5] },
        updatedAt: NOW,
      },
    });

    expect(cleaned["1396"].seasons).toEqual({ "1": [1, 3] });
  });

  it("takes the id from the key rather than from the stored field", () => {
    const cleaned = sanitizeProgress({
      "1396": { tvId: 999, seasons: { "1": [1] }, updatedAt: NOW },
    });

    expect(cleaned["1396"].tvId).toBe(1396);
  });

  it("survives missing metadata without losing the ticks", () => {
    const cleaned = sanitizeProgress({
      "1396": { seasons: { "1": [1] } },
    });

    expect(cleaned["1396"]).toEqual({
      tvId: 1396,
      name: "",
      posterPath: null,
      seasons: { "1": [1] },
      updatedAt: "",
    });
  });
});

describe("toggleEpisode", () => {
  it("adds an episode to a show that is not tracked yet", () => {
    const next = toggleEpisode({}, show, 1, 1, NOW);

    expect(next["1396"]).toEqual({
      ...show,
      seasons: { "1": [1] },
      updatedAt: NOW,
    });
  });

  it("keeps episodes sorted regardless of click order", () => {
    let next = toggleEpisode({}, show, 1, 3, NOW);
    next = toggleEpisode(next, show, 1, 1, NOW);

    expect(next["1396"].seasons["1"]).toEqual([1, 3]);
  });

  it("removes an episode that was already ticked", () => {
    const next = toggleEpisode(progressWith({ "1": [1, 2] }), show, 1, 1, NOW);

    expect(next["1396"].seasons["1"]).toEqual([2]);
  });

  it("drops the show once its last episode is un-ticked", () => {
    const next = toggleEpisode(progressWith({ "1": [1] }), show, 1, 1, NOW);

    expect(next).toEqual({});
  });

  it("leaves the previous map untouched", () => {
    const before = progressWith({ "1": [1] });
    toggleEpisode(before, show, 1, 2, NOW);

    expect(before["1396"].seasons["1"]).toEqual([1]);
  });

  it("refreshes the stored title from the show it was given", () => {
    const renamed = { ...show, name: "Breaking Bad (2008)" };
    const next = toggleEpisode(progressWith({ "1": [1] }), renamed, 1, 2, NOW);

    expect(next["1396"].name).toBe("Breaking Bad (2008)");
    expect(next["1396"].updatedAt).toBe(NOW);
  });
});

describe("setSeasonWatched", () => {
  it("ticks a whole season without touching the others", () => {
    const next = setSeasonWatched(
      progressWith({ "1": [1], "2": [5] }),
      show,
      1,
      [1, 2, 3],
      true,
      NOW,
    );

    expect(next["1396"].seasons).toEqual({ "1": [1, 2, 3], "2": [5] });
  });

  it("un-ticks only the episodes it was handed", () => {
    // The caller passes aired episodes, so an unaired one stays as it was.
    const next = setSeasonWatched(
      progressWith({ "1": [1, 2, 3, 9] }),
      show,
      1,
      [1, 2, 3],
      false,
      NOW,
    );

    expect(next["1396"].seasons).toEqual({ "1": [9] });
  });

  it("drops the show when un-ticking empties it", () => {
    const next = setSeasonWatched(
      progressWith({ "1": [1, 2] }),
      show,
      1,
      [1, 2],
      false,
      NOW,
    );

    expect(next).toEqual({});
  });
});

describe("lookups", () => {
  it("answers whether a single episode is ticked", () => {
    const progress = progressWith({ "1": [1, 2] });

    expect(isEpisodeWatched(progress, 1396, 1, 2)).toBe(true);
    expect(isEpisodeWatched(progress, 1396, 1, 3)).toBe(false);
    expect(isEpisodeWatched(progress, 1396, 2, 1)).toBe(false);
    expect(isEpisodeWatched(progress, 999, 1, 1)).toBe(false);
  });

  it("counts every ticked episode of a show", () => {
    expect(showWatchedCount(progressWith({ "1": [1, 2], "2": [1] }), 1396)).toBe(
      3,
    );
    expect(showWatchedCount({}, 1396)).toBe(0);
  });

  it("forgets a show entirely", () => {
    expect(removeShowProgress(progressWith({ "1": [1] }), 1396)).toEqual({});
  });
});
