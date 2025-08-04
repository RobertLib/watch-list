import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MovieDetails, ReleaseDatesResult, TVShowDetails } from "@/types/tmdb";
import type { CalendarSeed } from "./release-calendar";

/**
 * What happened while the visitor was away.
 *
 * The mirror image of the release calendar, and the window is the whole point:
 * strictly after the last visit and not after today. Both ends are inclusive
 * traps – something that aired on the day of the last visit was already seen on
 * that visit, and something dated tomorrow has not happened at all – and a
 * comparison off by one at either end turns "while you were away" into a row
 * that is either stale or fictional.
 */

vi.mock("./tmdb-cache", () => ({
  getCachedMovieDetails: vi.fn(),
  getCachedTVShowDetails: vi.fn(),
}));

const { getCachedMovieDetails, getCachedTVShowDetails } = await import(
  "./tmdb-cache"
);
const { getReleasesSince } = await import("./since-last-visit-data");

const SINCE = "2026-09-01";
const TODAY = "2026-09-13";

function showSeed(over: Partial<CalendarSeed> = {}): CalendarSeed {
  return {
    id: 1396,
    mediaType: "tv",
    title: "Stored Name",
    posterPath: "/stored.jpg",
    releaseDate: null,
    ...over,
  };
}

function movieSeed(over: Partial<CalendarSeed> = {}): CalendarSeed {
  return {
    id: 550,
    mediaType: "movie",
    title: "Stored Title",
    posterPath: "/stored.jpg",
    releaseDate: "2026-09-05",
    ...over,
  };
}

function show(lastAirDate: string | null, over: Partial<TVShowDetails> = {}) {
  return {
    id: 1396,
    name: "A Series",
    poster_path: "/tmdb.jpg",
    last_episode_to_air: lastAirDate
      ? {
          air_date: lastAirDate,
          season_number: 2,
          episode_number: 5,
          name: "An Episode",
        }
      : null,
    ...over,
  } as TVShowDetails;
}

function movie(releaseDate: string, over: Partial<MovieDetails> = {}) {
  return {
    id: 550,
    title: "A Film",
    poster_path: "/tmdb.jpg",
    release_date: releaseDate,
    ...over,
  } as MovieDetails;
}

function regionalDates(region: string, date: string, type = 3): ReleaseDatesResult {
  return {
    iso_3166_1: region,
    release_dates: [{
      type, release_date: `${date}T00:00:00.000Z`,
      certification: "", iso_639_1: "", note: "",
    }],
  };
}

beforeEach(() => {
  vi.mocked(getCachedMovieDetails).mockReset();
  vi.mocked(getCachedTVShowDetails).mockReset();
});

describe("regional releases since the last visit", () => {
  it("finds a local premiere even when the stored primary release is months old", async () => {
    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie("2026-01-01", {
      release_dates: {
        id: 550,
        results: [
          regionalDates("US", "2026-01-01"),
          regionalDates("CZ", "2026-09-05"),
        ],
      },
    }));
    const seeds = [movieSeed({ releaseDate: "2026-01-01" })];

    const releases = await getReleasesSince(seeds, SINCE, TODAY, "CZ");

    expect(releases.map((release) => release.date)).toEqual(["2026-09-05"]);
    expect(releases[0].movieReleaseSource).toBe("regional-theatrical");
    expect(getCachedMovieDetails).toHaveBeenCalledWith(
      550, "release_dates", expect.objectContaining({ priority: "background" }),
    );
    expect(await getReleasesSince(seeds, SINCE, TODAY, "US")).toEqual([]);
  });

  it("does not announce a global release before the local cinema premiere", async () => {
    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie("2026-09-05", {
      release_dates: { id: 550, results: [regionalDates("CZ", "2026-10-05")] },
    }));

    expect(await getReleasesSince([movieSeed()], SINCE, TODAY, "CZ")).toEqual([]);
  });

  it("uses the local date even when the primary date is still in the future", async () => {
    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie("2026-10-05", {
      release_dates: { id: 550, results: [regionalDates("CZ", "2026-09-05")] },
    }));

    const releases = await getReleasesSince([movieSeed()], SINCE, TODAY, "CZ");
    expect(releases.map((release) => release.date)).toEqual(["2026-09-05"]);
  });

  it.each([
    { results: [regionalDates("US", "2026-01-01")] },
    { results: [regionalDates("CZ", "2026-09-02", 4)] },
    { results: [] },
  ])("falls back to the primary date when local cinema dates are absent: %j", async ({ results }) => {
    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie("2026-09-05", {
      release_dates: { id: 550, results },
    }));

    const releases = await getReleasesSince([movieSeed()], SINCE, TODAY, "CZ");
    expect(releases.map((release) => release.date)).toEqual(["2026-09-05"]);
    expect(releases[0].movieReleaseSource).toBe("primary");
  });
});

describe("getReleasesSince", () => {
  it("answers nothing when nothing is followed", async () => {
    expect(await getReleasesSince([], SINCE, TODAY)).toEqual([]);
    expect(getCachedTVShowDetails).not.toHaveBeenCalled();
  });

  it("refuses a malformed window rather than guessing at it", async () => {
    expect(await getReleasesSince([showSeed()], "yesterday", TODAY)).toEqual([]);
    expect(await getReleasesSince([showSeed()], SINCE, "")).toEqual([]);
    expect(getCachedTVShowDetails).not.toHaveBeenCalled();
  });

  it("reports an episode that aired inside the window", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show("2026-09-07"));

    const releases = await getReleasesSince([showSeed()], SINCE, TODAY);

    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({
      key: "tv-1396-2-5",
      mediaType: "tv",
      title: "A Series",
      date: "2026-09-07",
      seasonNumber: 2,
      episodeNumber: 5,
      episodeName: "An Episode",
    });
  });

  it("reports an elapsed next episode when the cached last episode predates the window", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show("2026-08-30", {
      next_episode_to_air: {
        air_date: TODAY, season_number: 2, episode_number: 6, name: "New Episode",
      } as TVShowDetails["next_episode_to_air"],
    }));

    expect(await getReleasesSince([showSeed()], SINCE, TODAY)).toMatchObject([{
      key: "tv-1396-2-6", date: TODAY, seasonNumber: 2,
      episodeNumber: 6, episodeName: "New Episode",
    }]);
  });

  it("reports an elapsed next episode even when there is no last episode", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show(null, {
      next_episode_to_air: {
        air_date: SINCE, season_number: 1, episode_number: 1, name: "Premiere",
      } as TVShowDetails["next_episode_to_air"],
    }));

    expect(await getReleasesSince([showSeed()], SINCE, TODAY)).toMatchObject([{
      key: "tv-1396-1-1", date: SINCE, episodeName: "Premiere",
    }]);
  });

  it.each([
    { air_date: "2026-09-20", season_number: 2, episode_number: 6 },
    { air_date: "2026-08-30", season_number: 2, episode_number: 6 },
    { air_date: "2026-09-31", season_number: 2, episode_number: 6 },
    { air_date: "not-a-date", season_number: 2, episode_number: 6 },
    { air_date: null, season_number: 2, episode_number: 6 },
    { air_date: TODAY, season_number: -1, episode_number: 6 },
    { air_date: TODAY, season_number: 2, episode_number: 0 },
    { air_date: TODAY, season_number: 2, episode_number: 6.5 },
  ])("does not let an ineligible next episode hide the last: %j", async (next) => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show("2026-09-07", {
      next_episode_to_air: next as TVShowDetails["next_episode_to_air"],
    }));

    expect(await getReleasesSince([showSeed()], SINCE, TODAY)).toMatchObject([{
      key: "tv-1396-2-5", date: "2026-09-07",
    }]);
  });

  it.each([
    { lastDate: "2026-09-07", nextDate: TODAY, expectedEpisode: 6, expectedDate: TODAY },
    { lastDate: TODAY, nextDate: "2026-09-07", expectedEpisode: 5, expectedDate: TODAY },
    { lastDate: TODAY, nextDate: TODAY, expectedEpisode: 6, expectedDate: TODAY },
  ])("keeps one newest episode from both eligible markers: %j", async ({ lastDate, nextDate, expectedEpisode, expectedDate }) => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show(lastDate, {
      next_episode_to_air: {
        air_date: nextDate, season_number: 2, episode_number: 6, name: "New Episode",
      } as TVShowDetails["next_episode_to_air"],
    }));

    const releases = await getReleasesSince([showSeed()], SINCE, TODAY);

    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({ date: expectedDate, episodeNumber: expectedEpisode });
  });

  it("does not duplicate an episode repeated in both markers", async () => {
    const details = show(TODAY);
    details.next_episode_to_air = details.last_episode_to_air;
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(details);

    expect(await getReleasesSince([showSeed()], SINCE, TODAY)).toMatchObject([{
      key: "tv-1396-2-5", date: TODAY,
    }]);
  });

  it("drops an episode from before the last visit", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show("2026-08-30"));

    expect(await getReleasesSince([showSeed()], SINCE, TODAY)).toEqual([]);
  });

  it("drops an episode dated after today", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show("2026-09-20"));

    expect(await getReleasesSince([showSeed()], SINCE, TODAY)).toEqual([]);
  });

  /** Both ends are inclusive, which is what the comparisons actually say. */
  it("includes the boundary days themselves", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show(SINCE));
    expect(await getReleasesSince([showSeed()], SINCE, TODAY)).toHaveLength(1);

    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show(TODAY));
    expect(await getReleasesSince([showSeed()], SINCE, TODAY)).toHaveLength(1);
  });

  it("skips a show with no aired episode at all", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show(null));

    expect(await getReleasesSince([showSeed()], SINCE, TODAY)).toEqual([]);
  });

  it("reports a film released inside the window", async () => {
    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie("2026-09-05"));

    const releases = await getReleasesSince([movieSeed()], SINCE, TODAY);

    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({
      key: "movie-550",
      mediaType: "movie",
      date: "2026-09-05",
      seasonNumber: null,
      episodeNumber: null,
    });
  });

  it("sorts most recent first, breaking ties by title", async () => {
    vi.mocked(getCachedMovieDetails).mockImplementation(async (id: number) => {
      if (id === 1) return movie("2026-09-05", { id: 1, title: "Zebra" });
      if (id === 2) return movie("2026-09-05", { id: 2, title: "Alpha" });
      return movie("2026-09-10", { id: 3, title: "Newest" });
    });

    const releases = await getReleasesSince(
      [
        movieSeed({ id: 1 }),
        movieSeed({ id: 2 }),
        movieSeed({ id: 3, releaseDate: "2026-09-10" }),
      ],
      SINCE,
      TODAY,
    );

    expect(releases.map((r) => r.title)).toEqual(["Newest", "Alpha", "Zebra"]);
  });

  /** Past a dozen this stops being "since you were here" and becomes a calendar. */
  it("caps the row at twelve", async () => {
    vi.mocked(getCachedMovieDetails).mockImplementation(async (id: number) =>
      movie("2026-09-05", { id, title: `Film ${id}` }),
    );

    const seeds = Array.from({ length: 40 }, (_, i) =>
      movieSeed({ id: i + 1 }),
    );

    expect(await getReleasesSince(seeds, SINCE, TODAY)).toHaveLength(12);
  });

  it("checks shows and local premieres beyond the calendar caps and batch boundaries", async () => {
    vi.mocked(getCachedTVShowDetails).mockImplementation(async (id: number) =>
      show(id === 65 ? "2026-09-07" : "2026-08-30", { id }),
    );
    vi.mocked(getCachedMovieDetails).mockImplementation(async (id: number) =>
      movie("2026-01-01", {
        id,
        release_dates: {
          id, results: [regionalDates("CZ", id === 65 ? "2026-09-12" : "2026-01-01")],
        },
      }),
    );
    const seeds = [
      ...Array.from({ length: 65 }, (_, index) => showSeed({ id: index + 1 })),
      ...Array.from({ length: 65 }, (_, index) => movieSeed({
        id: index + 1, releaseDate: "2026-01-01",
      })),
    ];

    const releases = await getReleasesSince(seeds, SINCE, TODAY, "CZ");

    expect(getCachedTVShowDetails).toHaveBeenCalledTimes(65);
    expect(getCachedMovieDetails).toHaveBeenCalledTimes(65);
    expect(releases.map(({ id, mediaType, date }) => ({ id, mediaType, date }))).toEqual([
      { id: 65, mediaType: "movie", date: "2026-09-12" },
      { id: 65, mediaType: "tv", date: "2026-09-07" },
    ]);
  });

  it("includes the newest release from a later batch before capping the row", async () => {
    vi.mocked(getCachedMovieDetails).mockImplementation(async (id: number) =>
      movie(id === 121 ? TODAY : "2026-09-05", { id, title: `Film ${id}` }),
    );

    const releases = await getReleasesSince(
      Array.from({ length: 121 }, (_, index) => movieSeed({ id: index + 1 })),
      SINCE, TODAY,
    );

    expect(getCachedMovieDetails).toHaveBeenCalledTimes(121);
    expect(releases).toHaveLength(12);
    expect(releases[0]).toMatchObject({ id: 121, date: TODAY });
  });

  it("rejects the entire check when a later batch has a transient failure", async () => {
    const error = new Error("TMDB API error: 503 Service Unavailable");
    vi.mocked(getCachedMovieDetails).mockImplementation(async (id: number) => {
      if (id === 61) throw error;
      return movie("2026-09-05", { id });
    });

    await expect(getReleasesSince(
      Array.from({ length: 61 }, (_, index) => movieSeed({ id: index + 1 })),
      SINCE, TODAY,
    )).rejects.toBe(error);
    expect(getCachedMovieDetails).toHaveBeenCalledTimes(61);
  });

  it("continues past a batch of removed titles to find a later release", async () => {
    vi.mocked(getCachedTVShowDetails).mockImplementation(async (id: number) => {
      if (id <= 60) throw new Error("TMDB API error: 404 Not Found");
      return show(TODAY, { id });
    });

    const releases = await getReleasesSince(
      Array.from({ length: 61 }, (_, index) => showSeed({ id: index + 1 })),
      SINCE, TODAY,
    );

    expect(getCachedTVShowDetails).toHaveBeenCalledTimes(61);
    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({ id: 61, date: TODAY });
  });

  it("survives a title that fails to load", async () => {
    vi.mocked(getCachedMovieDetails).mockImplementation(async (id: number) => {
      if (id === 404) throw new Error("TMDB API error: 404 Not Found");
      return movie("2026-09-05", { id, title: "Survivor" });
    });

    const releases = await getReleasesSince(
      [movieSeed({ id: 404 }), movieSeed({ id: 550 })],
      SINCE,
      TODAY,
    );

    expect(releases.map((r) => r.title)).toEqual(["Survivor"]);
  });

  it("does not acknowledge a partial transient failure as a complete interval", async () => {
    const error = new Error("TMDB API error: 503 Service Unavailable");
    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie("2026-09-05"));
    vi.mocked(getCachedTVShowDetails).mockRejectedValue(error);

    await expect(getReleasesSince([movieSeed(), showSeed()], SINCE, TODAY)).rejects.toBe(error);
  });

  it("surfaces a complete outage instead of returning no releases", async () => {
    vi.mocked(getCachedTVShowDetails).mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(getReleasesSince([showSeed()], SINCE, TODAY)).rejects.toThrow("Failed to fetch");
  });

  it("treats confirmed removed titles as a successfully checked empty interval", async () => {
    vi.mocked(getCachedTVShowDetails).mockRejectedValue(new Error("TMDB API error: 404 Not Found"));
    vi.mocked(getCachedMovieDetails).mockRejectedValue(new Error("TMDB API error: 404 Not Found"));

    await expect(getReleasesSince([movieSeed(), showSeed()], SINCE, TODAY)).resolves.toEqual([]);
  });

  it("falls back to the stored name and poster when TMDB has neither", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(
      show("2026-09-07", { name: "", poster_path: null }),
    );

    const [release] = await getReleasesSince([showSeed()], SINCE, TODAY);

    expect(release.title).toBe("Stored Name");
    expect(release.posterPath).toBe("/stored.jpg");
  });
});
