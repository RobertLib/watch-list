import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shiftDate, todayLocal } from "./dates";

/**
 * The app's data-loading surface, and the only place its arguments are checked.
 *
 * Every function here used to be a Server Action – an HTTP endpoint – and the
 * sanitisers date from then. They still earn their place: the arguments come out
 * of the query string and out of browser storage, both of which are as
 * hand-editable as the endpoint ever was.
 *
 * The leaf modules that reach TMDB are mocked; the sanitisers themselves stay
 * real, because it is the composition that is worth pinning – a guard nobody
 * calls is the failure mode this file exists to catch.
 */

const withOriginal = async <T extends object>(
  load: () => Promise<T>,
  overrides: Partial<Record<keyof T, unknown>>,
) => ({ ...(await load()), ...overrides });

vi.mock("./tmdb-discover", async (importOriginal) => ({
  tmdbDiscoverApi: {
    ...(await importOriginal<typeof import("./tmdb-discover")>())
      .tmdbDiscoverApi,
    discoverMoviesByGenre: vi.fn().mockResolvedValue({ results: [] }),
    discoverTVShowsByGenre: vi.fn().mockResolvedValue({ results: [] }),
    searchMulti: vi.fn().mockResolvedValue({ results: [] }),
    searchPerson: vi.fn().mockResolvedValue({ results: [] }),
    searchMovies: vi.fn().mockResolvedValue({ results: [] }),
    discoverMovies: vi.fn().mockResolvedValue({ results: [] }),
  },
}));

vi.mock("./tmdb", () => ({
  tmdbApi: { getSeasonDetails: vi.fn() },
}));

vi.mock("./daily-puzzle-data", async (importOriginal) =>
  withOriginal(importOriginal<typeof import("./daily-puzzle-data")>, {
    getDailyPuzzleView: vi.fn().mockResolvedValue(null),
    isCorrectGuess: vi.fn().mockReturnValue(true),
  }),
);

vi.mock("./rating-duel-data", async (importOriginal) =>
  withOriginal(importOriginal<typeof import("./rating-duel-data")>, {
    pickRatingDuel: vi.fn(),
    settleRatingDuel: vi.fn(),
  }),
);

vi.mock("./continue-watching-data", () => ({
  getContinueWatchingEpisodes: vi.fn(),
}));

vi.mock("./tonight-data", async (importOriginal) =>
  withOriginal(importOriginal<typeof import("./tonight-data")>, {
    getTonightCandidates: vi.fn(),
  }),
);
vi.mock("./shared-list-data", () => ({
  getSharedListItems: vi.fn(),
  getSharedListResolution: vi.fn(),
}));
vi.mock("./release-calendar-data", () => ({
  getReleaseCalendarFor: vi.fn(),
}));
vi.mock("./since-last-visit-data", () => ({ getReleasesSince: vi.fn() }));
vi.mock("./recommendations", async (importOriginal) =>
  withOriginal(importOriginal<typeof import("./recommendations")>, {
    getRecommendationsFromWatchlist: vi.fn(),
  }),
);

vi.mock("./stats-data", async (importOriginal) =>
  withOriginal(importOriginal<typeof import("./stats-data")>, {
    getTitleFacts: vi.fn(),
  }),
);

vi.mock("./watchlist-availability", async (importOriginal) =>
  withOriginal(importOriginal<typeof import("./watchlist-availability")>, {
    getWatchlistAvailability: vi.fn(),
  }),
);

const { tmdbDiscoverApi } = await import("./tmdb-discover");
const { tmdbApi } = await import("./tmdb");
const { getDailyPuzzleView, isCorrectGuess } = await import(
  "./daily-puzzle-data"
);
const { pickRatingDuel, settleRatingDuel } = await import("./rating-duel-data");
const { getContinueWatchingEpisodes } = await import(
  "./continue-watching-data"
);
const { getTonightCandidates } = await import("./tonight-data");
const { getReleaseCalendarFor } = await import("./release-calendar-data");
const { getReleasesSince } = await import("./since-last-visit-data");
const { getRecommendationsFromWatchlist } = await import("./recommendations");
const { getTitleFacts, TitleFactsLoadError } = await import("./stats-data");
const { getWatchlistAvailability } = await import("./watchlist-availability");
const { getSharedListItems, getSharedListResolution } = await import("./shared-list-data");
const api = await import("./api");

describe("recommendations cancellation", () => {
  it("sanitizes both lists and passes the caller's cancellation signal", async () => {
    const controller = new AbortController();
    const result = { items: [], basedOn: [] };
    vi.mocked(getRecommendationsFromWatchlist).mockResolvedValue(result);

    await expect(api.getWatchlistRecommendations([
      { id: 550, mediaType: "movie", title: "Fight Club", rating: 9 },
      { id: 550, mediaType: "movie", title: "Duplicate" },
      { id: -1, mediaType: "movie", title: "Invalid" },
    ], [
      { id: 1396, mediaType: "tv", title: "Breaking Bad" },
      { id: 2, mediaType: "person", title: "Invalid" },
    ], controller.signal)).resolves.toBe(result);

    expect(getRecommendationsFromWatchlist).toHaveBeenLastCalledWith([
      { id: 550, mediaType: "movie", title: "Fight Club", rating: 9 },
    ], [
      { id: 1396, mediaType: "tv", title: "Breaking Bad" },
    ], controller.signal);
  });
});

describe("watchlist availability cancellation", () => {
  it("passes cancellation through the public API while sanitizing saved references", async () => {
    const controller = new AbortController();
    const result = { region: "US", hasSelectedProviders: false, byKey: {}, checked: 0, failedKeys: [] };
    vi.mocked(getWatchlistAvailability).mockResolvedValue(result);

    await expect(api.getWatchlistAvailabilityFor([
      { id: 550, mediaType: "movie" },
      { id: -1, mediaType: "movie" },
      { id: 550, mediaType: "movie" },
      { id: 1396, mediaType: "tv" },
    ], controller.signal)).resolves.toBe(result);

    expect(getWatchlistAvailability).toHaveBeenLastCalledWith([
      { id: 550, mediaType: "movie" },
      { id: 1396, mediaType: "tv" },
    ], controller.signal);
  });
});

/**
 * The instant this suite runs at.
 *
 * Every expectation below derives its calendar day from `NOW` rather than
 * naming one, because the code under test asks `todayLocal()` – "today where
 * the visitor is" – and no single instant is the same calendar day everywhere:
 * UTC-12 to UTC+14 is a twenty-six hour spread, so some zone is always on the
 * other day. A hard-coded "2026-09-10" held from UTC-12 to UTC+11 and turned
 * the suite red on a clean checkout in Auckland, Suva, Apia and Kiritimati.
 */
const NOW = new Date("2026-09-10T12:00:00.000Z");

/** The day `NOW` falls on, in whichever zone the suite is running. */
const TODAY = todayLocal(NOW);

/** The ninety-day floor a long absence is clamped to. */
const EARLIEST = shiftDate(TODAY, -90);
const ORIGINAL_TZ = process.env.TZ;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe("genre ids", () => {
  it.each([0, -1, 1.5, NaN, "action"])("refuses %s", (genreId) => {
    expect(() =>
      api.discoverMoviesByGenre(genreId as number, 1),
    ).toThrow(/Invalid genre id/);
    expect(tmdbDiscoverApi.discoverMoviesByGenre).not.toHaveBeenCalled();
  });

  it("passes a real one through", async () => {
    await api.discoverTVShowsByGenre(18, 3);
    expect(tmdbDiscoverApi.discoverTVShowsByGenre).toHaveBeenCalledWith(18, 3);
  });
});

describe("search queries", () => {
  it("caps a query at a length any real title fits inside", async () => {
    await api.searchMulti("x".repeat(500), 1);

    const [query] = vi.mocked(tmdbDiscoverApi.searchMulti).mock.calls[0];
    expect(query).toHaveLength(200);
  });

  it("turns a non-string into an empty search rather than a crash", async () => {
    await api.searchPerson(undefined as unknown as string, 1);

    expect(tmdbDiscoverApi.searchPerson).toHaveBeenCalledWith("", 1);
  });

  it("sanitizes the film-only search the same way", async () => {
    await api.searchMovies("x".repeat(500), 0);
    await api.searchMovies(undefined as unknown as string);

    const calls = vi.mocked(tmdbDiscoverApi.searchMovies).mock.calls;
    expect(calls[0][0]).toHaveLength(200);
    expect(calls[0][1]).toBe(1);
    expect(calls[1]).toEqual(["", 1]);
  });
});

/**
 * The one guard with something at stake. The pool ships in the bundle and the
 * schedule is a pure function of the date, so a request for tomorrow is a
 * request for tomorrow's answer – and the archive means the day cannot simply be
 * pinned to today. Anything that is not a playable past day collapses to today
 * rather than erroring: a tab left open past midnight should still get a puzzle.
 */
describe("which day a puzzle request is about", () => {
  it("keeps a past day the archive is allowed to serve", async () => {
    await api.getDailyPuzzle("2026-09-09", 0, false);

    expect(getDailyPuzzleView).toHaveBeenCalledWith("2026-09-09", 0, false);
  });

  it.each([
    ["tomorrow", "2026-09-11"],
    ["next year", "2027-01-01"],
    ["before the game existed", "2020-01-01"],
    ["not a date at all", "whenever"],
    ["missing", undefined],
  ])("collapses %s to today", async (_label, day) => {
    await api.getDailyPuzzle(day, 0, false);

    expect(getDailyPuzzleView).toHaveBeenCalledWith("2026-09-10", 0, false);
  });

  it("holds the guess count inside the board's range", async () => {
    await api.getDailyPuzzle("2026-09-10", "lots", false);

    expect(getDailyPuzzleView).toHaveBeenCalledWith("2026-09-10", 0, false);
  });

  it("checks a guess against the same resolved day", async () => {
    expect(api.checkDailyGuess("2027-01-01", 550)).toBe(true);
    expect(isCorrectGuess).toHaveBeenCalledWith("2026-09-10", 550);
  });

  it.each([0, -1, 1.5, "550", null])(
    "refuses %s as a guessed film without consulting the pool",
    (movieId) => {
      expect(api.checkDailyGuess("2026-09-10", movieId)).toBe(false);
      expect(isCorrectGuess).not.toHaveBeenCalled();
    },
  );
});

describe("fetchSeasonDetails", () => {
  it("asks for the season when both ids are real", async () => {
    vi.mocked(tmdbApi.getSeasonDetails).mockResolvedValue({
      id: 1,
    } as Awaited<ReturnType<typeof tmdbApi.getSeasonDetails>>);

    await expect(api.fetchSeasonDetails(1399, 1)).resolves.toEqual({ id: 1 });
  });

  // Season 0 is where TMDB keeps the specials.
  it("allows season zero", async () => {
    vi.mocked(tmdbApi.getSeasonDetails).mockResolvedValue(
      {} as Awaited<ReturnType<typeof tmdbApi.getSeasonDetails>>,
    );
    await api.fetchSeasonDetails(1399, 0);

    expect(tmdbApi.getSeasonDetails).toHaveBeenCalledWith(1399, 0);
  });

  it.each([
    [0, 1],
    [-1, 1],
    [1.5, 1],
    [1399, -1],
    [1399, 1.5],
  ])("answers null for (%s, %s) rather than building that path", async (tv, season) => {
    await expect(api.fetchSeasonDetails(tv, season)).resolves.toBeNull();
    expect(tmdbApi.getSeasonDetails).not.toHaveBeenCalled();
  });

  it("answers null when the season cannot be loaded", async () => {
    vi.mocked(tmdbApi.getSeasonDetails).mockRejectedValue(new Error("404"));

    await expect(api.fetchSeasonDetails(1399, 1)).resolves.toBeNull();
  });
});

describe("getReleasesSinceLastVisit", () => {
  it("forwards cancellation with sanitized titles and the bounded visit interval", async () => {
    const controller = new AbortController();
    const seed = { id: 550, mediaType: "movie", title: "A Film", posterPath: null, releaseDate: null };
    vi.mocked(getReleasesSince).mockResolvedValue([]);

    await api.getReleasesSinceLastVisit(
      [seed, { id: -1, mediaType: "movie" }, seed],
      "2019-01-01",
      controller.signal,
    );

    expect(getReleasesSince).toHaveBeenLastCalledWith(
      [seed], EARLIEST, TODAY, undefined, controller.signal,
    );
  });

  it("preserves cancellation instead of returning an acknowledged empty interval", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.mocked(getReleasesSince).mockRejectedValue(controller.signal.reason);

    await expect(api.getReleasesSinceLastVisit([], "2026-09-01", controller.signal))
      .rejects.toBe(controller.signal.reason);
  });

  it("preserves a failed lookup so an unchecked visit is not acknowledged", async () => {
    const error = new Error("TMDB API error: 503 Service Unavailable");
    vi.mocked(getReleasesSince).mockRejectedValue(error);

    await expect(api.getReleasesSinceLastVisit([], "2026-09-01")).rejects.toBe(error);
  });

  it.each([
    ["Europe/Prague", "2026-09-09T22:30:00.000Z", "2026-09-09", "2026-09-10"],
    ["America/Los_Angeles", "2026-09-10T02:30:00.000Z", "2026-09-08", "2026-09-09"],
  ])("ends the interval on the visitor's local day in %s", async (zone, now, since, today) => {
    process.env.TZ = zone;
    vi.setSystemTime(new Date(now));
    vi.mocked(getReleasesSince).mockResolvedValue([]);

    await api.getReleasesSinceLastVisit([], since);

    expect(getReleasesSince).toHaveBeenLastCalledWith([], since, today);
  });

  it("refuses a 'since' that is not a calendar day", async () => {
    await expect(api.getReleasesSinceLastVisit([], "last Tuesday")).resolves.toEqual(
      [],
    );
    expect(getReleasesSince).not.toHaveBeenCalled();
  });

  it("refuses a 'since' in the future", async () => {
    await expect(
      api.getReleasesSinceLastVisit([], "2026-12-01"),
    ).resolves.toEqual([]);
    expect(getReleasesSince).not.toHaveBeenCalled();
  });

  it("passes a recent visit through as it stands", async () => {
    vi.mocked(getReleasesSince).mockResolvedValue([]);
    await api.getReleasesSinceLastVisit([], "2026-09-01");

    expect(getReleasesSince).toHaveBeenCalledWith([], "2026-09-01", TODAY);
  });

  /**
   * Ninety days is the whole window. Past that, "since you were last here" is
   * not the question anyone is asking – and an unbounded one turns a single page
   * view into a scan of every followed title's entire history.
   */
  it("clamps a long absence to the window", async () => {
    vi.mocked(getReleasesSince).mockResolvedValue([]);
    await api.getReleasesSinceLastVisit([], "2019-01-01");

    expect(getReleasesSince).toHaveBeenCalledWith([], EARLIEST, TODAY);
  });
});

describe("getReleaseCalendar", () => {
  it("forwards cancellation with sanitized followed titles and the local day", async () => {
    const controller = new AbortController();
    const seeds = [{ id: 550, mediaType: "movie", title: "A Film", posterPath: null, releaseDate: null }];
    await api.getReleaseCalendar([
      ...seeds, { id: -1, mediaType: "movie" }, seeds[0],
    ], controller.signal);

    expect(getReleaseCalendarFor).toHaveBeenLastCalledWith(
      seeds, TODAY, undefined, controller.signal,
    );
  });
});

describe("getWatchStatsFacts", () => {
  it("forwards the caller's cancellation signal with the sanitized history", async () => {
    const controller = new AbortController();
    vi.mocked(getTitleFacts).mockResolvedValue({});
    await api.getWatchStatsFacts([
      { id: 550, mediaType: "movie" }, { id: -1, mediaType: "movie" },
    ], controller.signal);
    expect(getTitleFacts).toHaveBeenLastCalledWith([
      { id: 550, mediaType: "movie" },
    ], controller.signal);
  });

  it("forwards the full watched history instead of silently truncating it at 200", async () => {
    vi.mocked(getTitleFacts).mockResolvedValue({});
    const refs = Array.from({ length: 205 }, (_, index) => ({
      id: index + 1, mediaType: "movie" as const,
    }));

    await api.getWatchStatsFacts([...refs, { id: -1, mediaType: "movie" }, refs[0]]);

    expect(getTitleFacts).toHaveBeenLastCalledWith(refs);
  });

  it("preserves the partial facts and missing titles in a failed lookup", async () => {
    const error = new TitleFactsLoadError({
      "movie-550": { id: 550, mediaType: "movie", runtime: 139, genres: ["Drama"], year: "1999" },
    }, ["movie-949"]);
    vi.mocked(getTitleFacts).mockRejectedValueOnce(error);

    await expect(api.getWatchStatsFacts([
      { id: 550, mediaType: "movie" },
      { id: 949, mediaType: "movie" },
    ])).rejects.toBe(error);
  });
});

/**
 * Each of these fans out over TMDB on behalf of one section of one page.
 * Sections with retry notices propagate outages; optional enrichments and
 * games retain their empty fallbacks.
 */
describe("failure handling for optional sections and standalone pages", () => {
  it("passes sanitized progress and cancellation to the continue watching resolver", async () => {
    const progress = {
      tvId: 1396,
      name: "Breaking Bad",
      posterPath: null,
      seasons: { "1": [1] },
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const controller = new AbortController();
    vi.mocked(getContinueWatchingEpisodes).mockResolvedValue([]);

    await api.getContinueWatching([progress, { ...progress, tvId: -1 }], controller.signal);

    expect(getContinueWatchingEpisodes).toHaveBeenLastCalledWith([progress], undefined, controller.signal);
  });

  it("continue watching propagates failure to the retry notice", async () => {
    vi.mocked(getContinueWatchingEpisodes).mockRejectedValue(new Error("x"));
    await expect(api.getContinueWatching({})).rejects.toThrow("x");
  });

  it("the tonight shortlist propagates failure to the retry notice", async () => {
    const error = new Error("Tonight details unavailable");
    vi.mocked(getTonightCandidates).mockRejectedValue(error);
    await expect(api.getTonightShortlist([])).rejects.toBe(error);
  });

  it("passes every valid saved title and cancellation to the tonight resolver", async () => {
    const refs = Array.from({ length: 121 }, (_, index) => ({
      id: index + 1, mediaType: "movie" as const,
    }));
    const controller = new AbortController();
    vi.mocked(getTonightCandidates).mockResolvedValue([]);

    await api.getTonightShortlist([...refs, refs[0], { id: -1, mediaType: "tv" }], controller.signal);

    expect(getTonightCandidates).toHaveBeenLastCalledWith(refs, controller.signal);
  });

  it("a rating duel", async () => {
    vi.mocked(pickRatingDuel).mockRejectedValue(new Error("x"));
    await expect(api.getRatingDuel([], false)).resolves.toBeNull();
  });

  it("passes the displayed champion score through when settling a duel", async () => {
    const result = { correct: true, challengerRating: 8 };
    vi.mocked(settleRatingDuel).mockResolvedValue(result);

    await expect(api.resolveRatingDuel(7, 680, "higher")).resolves.toBe(result);
    expect(settleRatingDuel).toHaveBeenLastCalledWith(7, 680, "higher");
  });

  it("keeps a failed duel settlement retryable", async () => {
    vi.mocked(settleRatingDuel).mockRejectedValue(new Error("TMDB unavailable"));
    await expect(api.resolveRatingDuel(7, 680, "higher")).resolves.toBeNull();
  });

  it("the stats facts propagate failure to the retry notice", async () => {
    vi.mocked(getTitleFacts).mockRejectedValue(new Error("x"));
    await expect(api.getWatchStatsFacts([])).rejects.toThrow("x");
  });

  it("the release calendar propagates failure to the retry notice", async () => {
    vi.mocked(getReleaseCalendarFor).mockRejectedValue(new Error("x"));

    await expect(api.getReleaseCalendar([])).rejects.toThrow("x");
  });
});

describe("getTitlesByRefs", () => {
  beforeEach(() => {
    vi.mocked(getSharedListItems).mockReset();
  });

  it("sanitizes stored references before looking up titles", async () => {
    vi.mocked(getSharedListItems).mockResolvedValue([]);
    const controller = new AbortController();

    await expect(api.getTitlesByRefs([
      { id: 550, mediaType: "movie" },
      { id: 1396, mediaType: "tv" },
      { id: -1, mediaType: "movie" },
      { id: 550, mediaType: "movie" },
      { id: 1, mediaType: "person" },
    ], controller.signal)).resolves.toEqual([]);

    expect(getSharedListItems).toHaveBeenCalledWith([
      { id: 550, mediaType: "movie" },
      { id: 1396, mediaType: "tv" },
    ], controller.signal);
  });

  it.each([
    new Error("TMDB API error: 503 Service Unavailable"),
    new TypeError("Failed to fetch"),
  ])("propagates %s to the rated titles retry notice", async (failure) => {
    vi.mocked(getSharedListItems).mockRejectedValue(failure);

    await expect(api.getTitlesByRefs([
      { id: 550, mediaType: "movie" },
    ])).rejects.toBe(failure);
  });
});

describe("getTitlesResolutionByRefs", () => {
  beforeEach(() => {
    vi.mocked(getSharedListResolution).mockReset();
  });

  it("sanitizes stored references and preserves partial lookup failures", async () => {
    const resolution = {
      items: [{
        id: 550,
        media_type: "movie" as const,
        title: "Fight Club",
        poster_path: "/poster.jpg",
        backdrop_path: null,
        release_date: "1999-10-15",
        vote_average: 8.4,
        vote_count: 100,
        overview: "",
        genre_ids: [],
      }],
      failedRefs: [{ id: 1396, mediaType: "tv" as const }],
    };
    vi.mocked(getSharedListResolution).mockResolvedValue(resolution);
    const controller = new AbortController();

    await expect(api.getTitlesResolutionByRefs([
      { id: 550, mediaType: "movie" },
      { id: 1396, mediaType: "tv" },
      { id: -1, mediaType: "movie" },
      { id: 550, mediaType: "movie" },
      { id: 1, mediaType: "person" },
    ], controller.signal)).resolves.toBe(resolution);

    expect(getSharedListResolution).toHaveBeenCalledWith([
      { id: 550, mediaType: "movie" },
      { id: 1396, mediaType: "tv" },
    ], controller.signal);
  });

  it.each([
    new Error("TMDB API error: 503 Service Unavailable"),
    new TypeError("Failed to fetch"),
  ])("propagates a complete %s to the retry notice", async (failure) => {
    vi.mocked(getSharedListResolution).mockRejectedValue(failure);

    await expect(api.getTitlesResolutionByRefs([
      { id: 550, mediaType: "movie" },
    ])).rejects.toBe(failure);
  });
});
