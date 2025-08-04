import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MovieDetails, TVShowDetails } from "@/types/tmdb";
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

beforeEach(() => {
  vi.mocked(getCachedMovieDetails).mockReset();
  vi.mocked(getCachedTVShowDetails).mockReset();
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

  it("falls back to the stored name and poster when TMDB has neither", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(
      show("2026-09-07", { name: "", poster_path: null }),
    );

    const [release] = await getReleasesSince([showSeed()], SINCE, TODAY);

    expect(release.title).toBe("Stored Name");
    expect(release.posterPath).toBe("/stored.jpg");
  });
});
