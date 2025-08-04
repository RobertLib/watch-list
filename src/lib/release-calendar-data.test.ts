import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MovieDetails, ReleaseDatesResult, TVShowDetails } from "@/types/tmdb";
import type { CalendarSeed } from "./release-calendar";

/**
 * The release calendar, assembled from TMDB.
 *
 * The bucketing and the date arithmetic are pure and tested in
 * `release-calendar.ts`; what is left here is the assembly, and its judgement
 * calls are the ones a visitor notices. A show with nothing scheduled has to
 * land in "awaiting" or vanish depending on whether it is coming back – put a
 * finished series in the waiting list and the page promises an episode that is
 * never coming. And the stored release date is deliberately not trusted: a film
 * pushed to next spring is the single thing this page exists to report, so TMDB
 * decides, not the copy the watchlist cached months ago.
 */

vi.mock("./tmdb-cache", () => ({
  getCachedMovieDetails: vi.fn(),
  getCachedTVShowDetails: vi.fn(),
}));

const { getCachedMovieDetails, getCachedTVShowDetails } = await import(
  "./tmdb-cache"
);
const { getReleaseCalendarFor } = await import("./release-calendar-data");

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
    releaseDate: "2026-12-01",
    ...over,
  };
}

function show(over: Partial<TVShowDetails> = {}): TVShowDetails {
  return {
    id: 1396,
    name: "A Series",
    poster_path: "/tmdb.jpg",
    status: "Returning Series",
    in_production: true,
    next_episode_to_air: null,
    ...over,
  } as TVShowDetails;
}

function movie(over: Partial<MovieDetails> = {}): MovieDetails {
  return {
    id: 550,
    title: "A Film",
    poster_path: "/tmdb.jpg",
    release_date: "2026-12-01",
    ...over,
  } as MovieDetails;
}

function regionalDates(
  region: string,
  entries: Array<[number, string]>,
): ReleaseDatesResult {
  return {
    iso_3166_1: region,
    release_dates: entries.map(([type, release_date]) => ({
      type, release_date, certification: "", iso_639_1: "", note: "",
    })),
  };
}

function episode(over: Record<string, unknown> = {}) {
  return {
    air_date: "2026-09-20",
    season_number: 3,
    episode_number: 4,
    name: "The One With The Thing",
    still_path: "/still.jpg",
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(getCachedMovieDetails).mockReset();
  vi.mocked(getCachedTVShowDetails).mockReset();
});

describe("getReleaseCalendarFor", () => {
  it.each([{ seeds: [] }, { seeds: [showSeed(), movieSeed()] }])(
    "rejects an already cancelled load before starting any lookup: %j",
    async ({ seeds }) => {
      const controller = new AbortController();
      const reason = new TypeError("The page has left");
      controller.abort(reason);

      await expect(getReleaseCalendarFor(seeds, TODAY, "CZ", controller.signal))
        .rejects.toBe(reason);
      expect(getCachedTVShowDetails).not.toHaveBeenCalled();
      expect(getCachedMovieDetails).not.toHaveBeenCalled();
    },
  );

  it("rejects cancellation even when another title has already resolved", async () => {
    const controller = new AbortController();
    const reason = new DOMException("The page has left", "AbortError");
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show());
    vi.mocked(getCachedMovieDetails).mockImplementation((_id, _append, options) =>
      new Promise((_resolve, reject) => {
        options!.signal!.addEventListener("abort", () => reject(options!.signal!.reason), { once: true });
      }),
    );

    const calendar = getReleaseCalendarFor([showSeed(), movieSeed()], TODAY, "CZ", controller.signal);
    const failure = expect(calendar).rejects.toBe(reason);
    await Promise.resolve();
    controller.abort(reason);
    await failure;
  });

  it("answers an empty calendar for an empty watchlist", async () => {
    expect(await getReleaseCalendarFor([], TODAY)).toEqual({
      events: [],
      awaiting: [],
      today: TODAY,
      checked: 0,
      eligible: 0,
    });
    expect(getCachedTVShowDetails).not.toHaveBeenCalled();
  });

  it("lists a scheduled episode as an event", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(
      show({ next_episode_to_air: episode() as never }),
    );

    const { events } = await getReleaseCalendarFor([showSeed()], TODAY);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      key: "tv-1396-3-4",
      mediaType: "tv",
      title: "A Series",
      date: "2026-09-20",
      seasonNumber: 3,
      episodeNumber: 4,
      episodeName: "The One With The Thing",
    });
  });

  it("prefers TMDB's name and poster over the stored copy", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(
      show({ next_episode_to_air: episode() as never }),
    );

    const { events } = await getReleaseCalendarFor([showSeed()], TODAY);

    expect(events[0].title).toBe("A Series");
    expect(events[0].posterPath).toBe("/tmdb.jpg");
  });

  it("falls back to the stored name when TMDB has none", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(
      show({ name: "", poster_path: null, next_episode_to_air: episode() as never }),
    );

    const { events } = await getReleaseCalendarFor([showSeed()], TODAY);

    expect(events[0].title).toBe("Stored Name");
    expect(events[0].posterPath).toBe("/stored.jpg");
  });

  it("drops an episode that already aired", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(
      show({
        next_episode_to_air: episode({ air_date: "2026-09-01" }) as never,
        in_production: false,
        status: "Ended",
      }),
    );

    const { events, awaiting } = await getReleaseCalendarFor(
      [showSeed()],
      TODAY,
    );

    expect(events).toEqual([]);
    expect(awaiting).toEqual([]);
  });

  it("keeps today's episode, which has not happened yet", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(
      show({ next_episode_to_air: episode({ air_date: TODAY }) as never }),
    );

    const { events } = await getReleaseCalendarFor([showSeed()], TODAY);

    expect(events).toHaveLength(1);
  });

  it("keeps today's aired episode after the next marker advances to a later date", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show({
      last_episode_to_air: episode({ air_date: TODAY, episode_number: 3 }) as never,
      next_episode_to_air: episode() as never,
    }));

    const { events, awaiting } = await getReleaseCalendarFor([showSeed()], TODAY);

    expect(events.map((event) => [event.date, event.episodeNumber])).toEqual([
      [TODAY, 3], ["2026-09-20", 4],
    ]);
    expect(awaiting).toEqual([]);
  });

  it("keeps an ended show's finale on its air date", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show({
      last_episode_to_air: episode({ air_date: TODAY }) as never,
      next_episode_to_air: null,
      in_production: false,
      status: "Ended",
    }));

    const { events, awaiting } = await getReleaseCalendarFor([showSeed()], TODAY);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ date: TODAY, seasonNumber: 3, episodeNumber: 4 });
    expect(awaiting).toEqual([]);
  });

  it("deduplicates today's episode when both markers point to it", async () => {
    const airingToday = episode({ air_date: TODAY });
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show({
      last_episode_to_air: airingToday as never,
      next_episode_to_air: airingToday as never,
    }));

    const { events } = await getReleaseCalendarFor([showSeed()], TODAY);

    expect(events).toHaveLength(1);
    expect(events[0].key).toBe("tv-1396-3-4");
  });

  it("does not restore older last-airing episodes into the calendar", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show({
      last_episode_to_air: episode({ air_date: "2026-09-12", episode_number: 3 }) as never,
      next_episode_to_air: episode() as never,
    }));

    const { events } = await getReleaseCalendarFor([showSeed()], TODAY);

    expect(events).toHaveLength(1);
    expect(events[0].date).toBe("2026-09-20");
  });

  /** The distinction that keeps the page from promising an episode. */
  it("files an unscheduled but returning show under awaiting", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(
      show({ next_episode_to_air: null, status: "Returning Series" }),
    );

    const { events, awaiting } = await getReleaseCalendarFor(
      [showSeed()],
      TODAY,
    );

    expect(events).toEqual([]);
    expect(awaiting).toEqual([
      {
        id: 1396,
        mediaType: "tv",
        slug: "a-series-1396",
        title: "A Series",
        posterPath: "/tmdb.jpg",
        status: "Returning Series",
      },
    ]);
  });

  it("leaves a finished series out entirely", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(
      show({ next_episode_to_air: null, status: "Ended", in_production: false }),
    );

    const { events, awaiting } = await getReleaseCalendarFor(
      [showSeed()],
      TODAY,
    );

    expect(events).toEqual([]);
    expect(awaiting).toEqual([]);
  });

  it("lists an upcoming film", async () => {
    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie());

    const { events } = await getReleaseCalendarFor([movieSeed()], TODAY);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      key: "movie-550",
      mediaType: "movie",
      date: "2026-12-01",
      seasonNumber: null,
      episodeNumber: null,
    });
  });

  /** TMDB is the authority: a film pushed back is the news, not a stale seed. */
  it("believes TMDB's release date over the stored one", async () => {
    vi.mocked(getCachedMovieDetails).mockResolvedValue(
      movie({ release_date: "2027-04-02" }),
    );

    const { events } = await getReleaseCalendarFor(
      [movieSeed({ releaseDate: "2026-10-01" })],
      TODAY,
    );

    expect(events[0].date).toBe("2027-04-02");
  });

  it("drops a film TMDB says has already come out", async () => {
    vi.mocked(getCachedMovieDetails).mockResolvedValue(
      movie({ release_date: "2026-01-01" }),
    );

    const { events } = await getReleaseCalendarFor([movieSeed()], TODAY);

    expect(events).toEqual([]);
  });

  it("drops a film with no usable date", async () => {
    vi.mocked(getCachedMovieDetails).mockResolvedValue(
      movie({ release_date: "" }),
    );

    const { events } = await getReleaseCalendarFor([movieSeed()], TODAY);

    expect(events).toEqual([]);
  });

  it.each(["Rumored", "Planned", "In Production", "Post Production"])(
    "keeps an undated %s film in the waiting list",
    async (status) => {
      vi.mocked(getCachedMovieDetails).mockResolvedValue(movie({
        release_date: "", status, release_dates: { id: 550, results: [] },
      }));

      const calendar = await getReleaseCalendarFor([movieSeed({ releaseDate: null })], TODAY);

      expect(calendar.events).toEqual([]);
      expect(calendar.awaiting).toEqual([{
        id: 550, mediaType: "movie", slug: "a-film-550", title: "A Film",
        posterPath: "/tmdb.jpg", status,
      }]);
      expect(calendar.checked).toBe(1);
      expect(calendar.eligible).toBe(1);
    },
  );

  it.each(["Released", "Canceled"])("does not await an undated %s film", async (status) => {
    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie({ release_date: "", status }));

    const calendar = await getReleaseCalendarFor([movieSeed()], TODAY);

    expect(calendar.events).toEqual([]);
    expect(calendar.awaiting).toEqual([]);
  });

  it("sorts events soonest first, breaking ties by title", async () => {
    vi.mocked(getCachedMovieDetails).mockImplementation(async (id: number) => {
      if (id === 1) return movie({ id: 1, title: "Zebra", release_date: "2026-10-01" });
      if (id === 2) return movie({ id: 2, title: "Alpha", release_date: "2026-10-01" });
      return movie({ id: 3, title: "Middle", release_date: "2026-09-20" });
    });

    const { events } = await getReleaseCalendarFor(
      [
        movieSeed({ id: 1, releaseDate: "2026-10-01" }),
        movieSeed({ id: 2, releaseDate: "2026-10-01" }),
        movieSeed({ id: 3, releaseDate: "2026-09-20" }),
      ],
      TODAY,
    );

    expect(events.map((e) => e.title)).toEqual(["Middle", "Alpha", "Zebra"]);
  });

  /** One forgotten title should cost one row, not the whole calendar. */
  it("survives a title that fails to load", async () => {
    vi.mocked(getCachedMovieDetails).mockImplementation(async (id: number) => {
      if (id === 404) throw new Error("TMDB API error: 404 Not Found");
      return movie({ id, title: "Survivor" });
    });

    const { events } = await getReleaseCalendarFor(
      [movieSeed({ id: 404 }), movieSeed({ id: 550 })],
      TODAY,
    );

    expect(events.map((e) => e.title)).toEqual(["Survivor"]);
  });

  it("surfaces an outage when every eligible title fails", async () => {
    const outage = new Error("TMDB API error: 503 Service Unavailable");
    vi.mocked(getCachedMovieDetails).mockRejectedValue(outage);
    vi.mocked(getCachedTVShowDetails).mockRejectedValue(outage);

    await expect(getReleaseCalendarFor([movieSeed(), showSeed()], TODAY))
      .rejects.toBe(outage);
  });

  it("keeps partial calendar data during an outage", async () => {
    vi.mocked(getCachedTVShowDetails).mockRejectedValue(new TypeError("offline"));
    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie());

    const calendar = await getReleaseCalendarFor([movieSeed(), showSeed()], TODAY);
    expect(calendar.events.map((event) => event.id)).toEqual([550]);
    expect(calendar.checked).toBe(1);
    expect(calendar.eligible).toBe(2);
    expect(calendar.failedKeys).toEqual(["tv-1396"]);
  });

  it.each([
    new Error("TMDB API error: 503 Service Unavailable"),
    new DOMException("Timed out", "TimeoutError"),
  ])("keeps retryable failures distinct from removed titles: %s", async (failure) => {
    vi.mocked(getCachedTVShowDetails).mockImplementation(async (id) => {
      if (id === 1) throw new Error("TMDB API error: 404 Not Found");
      if (id === 2) throw failure;
      return show({ id, next_episode_to_air: episode() as never });
    });
    vi.mocked(getCachedMovieDetails).mockRejectedValue(failure);

    const calendar = await getReleaseCalendarFor([
      showSeed({ id: 1 }), showSeed({ id: 2 }), showSeed({ id: 3 }), movieSeed(),
    ], TODAY);

    expect(calendar.events.map((event) => event.id)).toEqual([3]);
    expect(calendar.checked).toBe(2);
    expect(calendar.eligible).toBe(4);
    expect(calendar.failedKeys).toEqual(["tv-2", "movie-550"]);
  });

  it("returns an empty calendar when every title really has been removed", async () => {
    vi.mocked(getCachedTVShowDetails).mockRejectedValue(
      new Error("TMDB API error: 404 Not Found"),
    );
    const calendar = await getReleaseCalendarFor([showSeed()], TODAY);
    expect(calendar.events).toEqual([]);
    expect(calendar.awaiting).toEqual([]);
    expect(calendar.checked).toBe(1);
    expect(calendar.eligible).toBe(1);
    expect(calendar.failedKeys).toBeUndefined();
  });

  it("reports the day it was built for", async () => {
    const calendar = await getReleaseCalendarFor([], TODAY);

    expect(calendar.today).toBe(TODAY);
  });
});

/**
 * The calendar is built from a capped number of look-ups, and a calendar built
 * from part of a list must not present itself as the whole of it. The counts
 * are what let the page say so.
 */
describe("getReleaseCalendarFor and how much of the list it covered", () => {
  it("reports every title checked when the list fits under the caps", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show());
    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie());

    const calendar = await getReleaseCalendarFor(
      [showSeed(), movieSeed()],
      TODAY,
    );

    expect(calendar.checked).toBe(2);
    expect(calendar.eligible).toBe(2);
  });

  it("says how many were due a look-up when the caps cut the list short", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show());

    const seeds = Array.from({ length: 45 }, (_, i) =>
      showSeed({ id: i + 1 }),
    );
    const calendar = await getReleaseCalendarFor(seeds, TODAY);

    expect(calendar.eligible).toBe(45);
    expect(calendar.checked).toBe(30);
    expect(calendar.failedKeys).toBeUndefined();
  });

  it("does not mark titles outside the cap as failed lookups", async () => {
    vi.mocked(getCachedTVShowDetails).mockImplementation(async (id) => {
      if (id === 1) throw new TypeError("offline");
      return show({ id });
    });

    const calendar = await getReleaseCalendarFor(
      Array.from({ length: 45 }, (_, i) => showSeed({ id: i + 1 })), TODAY,
    );

    expect(getCachedTVShowDetails).toHaveBeenCalledTimes(30);
    expect(calendar.checked).toBe(29);
    expect(calendar.eligible).toBe(45);
    expect(calendar.failedKeys).toEqual(["tv-1"]);
  });

  it("checks older stored film dates for delayed regional premieres", async () => {
    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie());

    const calendar = await getReleaseCalendarFor(
      [movieSeed(), movieSeed({ id: 551, releaseDate: "1999-10-15" })],
      TODAY,
    );

    expect(calendar.eligible).toBe(2);
    expect(calendar.checked).toBe(2);
  });

  it("counts a confirmed removed title as checked without requesting a retry", async () => {
    vi.mocked(getCachedMovieDetails).mockImplementation(async (id: number) => {
      if (id === 404) throw new Error("TMDB API error: 404 Not Found");
      return movie({ id });
    });

    const calendar = await getReleaseCalendarFor(
      [movieSeed({ id: 404 }), movieSeed({ id: 550 })],
      TODAY,
    );

    expect(calendar.eligible).toBe(2);
    expect(calendar.checked).toBe(2);
    expect(calendar.failedKeys).toBeUndefined();
  });
});

describe("regional cinema releases", () => {
  it("finds a local premiere even when the stored primary release is long past", async () => {
    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie({
      release_date: "2026-01-01",
      release_dates: {
        id: 550,
        results: [
          regionalDates("US", [[3, "2026-01-01T00:00:00.000Z"]]),
          regionalDates("CZ", [[3, "2026-10-09T00:00:00.000Z"]]),
        ],
      },
    }));

    const calendar = await getReleaseCalendarFor(
      [movieSeed({ releaseDate: "2026-01-01" })], TODAY, "CZ",
    );

    expect(calendar.events.map((event) => event.date)).toEqual(["2026-10-09"]);
    expect(calendar.events[0].movieReleaseSource).toBe("regional-theatrical");
    expect(getCachedMovieDetails).toHaveBeenCalledWith(550, "release_dates", {
      signal: undefined, priority: "background",
    });
    expect(calendar.checked).toBe(1);
    expect(calendar.eligible).toBe(1);

    const usCalendar = await getReleaseCalendarFor([movieSeed()], TODAY, "US");
    expect(usCalendar.events).toEqual([]);
  });

  it("prefers the wide cinema premiere over earlier limited, festival and digital dates", async () => {
    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie({
      release_dates: {
        id: 550,
        results: [regionalDates("CZ", [
          [1, "2026-09-15T00:00:00.000Z"],
          [2, "2026-09-20T00:00:00.000Z"],
          [4, "2026-09-18T00:00:00.000Z"],
          [3, "2026-10-09T00:00:00.000Z"],
        ])],
      },
    }));

    const calendar = await getReleaseCalendarFor([movieSeed()], TODAY, "CZ");
    expect(calendar.events[0].date).toBe("2026-10-09");
  });

  it("uses a valid limited cinema date when no wide release is known", async () => {
    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie({
      release_dates: {
        id: 550,
        results: [regionalDates("CZ", [
          [3, "2026-13-40T00:00:00.000Z"],
          [2, "2026-10-12T00:00:00.000Z"],
          [2, "2026-10-09T23:00:00.000Z"],
        ])],
      },
    }));

    const calendar = await getReleaseCalendarFor([movieSeed()], TODAY, "CZ");
    expect(calendar.events[0].date).toBe("2026-10-09");
  });

  it("falls back to TMDB's primary date when local cinema dates are missing", async () => {
    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie({
      release_date: "2026-11-01",
      release_dates: {
        id: 550,
        results: [regionalDates("CZ", [[4, "2026-10-09T00:00:00.000Z"]])],
      },
    }));

    const calendar = await getReleaseCalendarFor([movieSeed()], TODAY, "CZ");
    expect(calendar.events[0].date).toBe("2026-11-01");
    expect(calendar.events[0].movieReleaseSource).toBe("primary");
  });

  it("does not replace a known past local premiere with a future primary or stored date", async () => {
    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie({
      release_dates: {
        id: 550,
        results: [regionalDates("CZ", [[3, "2026-09-01T00:00:00.000Z"]])],
      },
    }));

    const calendar = await getReleaseCalendarFor([movieSeed()], TODAY, "CZ");
    expect(calendar.events).toEqual([]);
  });
});
