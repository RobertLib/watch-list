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

vi.mock("./tonight-data", () => ({ getTonightCandidates: vi.fn() }));
vi.mock("./shared-list-data", () => ({ getSharedListItems: vi.fn() }));
vi.mock("./release-calendar-data", () => ({
  getReleaseCalendarFor: vi.fn(),
}));
vi.mock("./since-last-visit-data", () => ({ getReleasesSince: vi.fn() }));

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
const { pickRatingDuel } = await import("./rating-duel-data");
const { getContinueWatchingEpisodes } = await import(
  "./continue-watching-data"
);
const { getTonightCandidates } = await import("./tonight-data");
const { getReleaseCalendarFor } = await import("./release-calendar-data");
const { getReleasesSince } = await import("./since-last-visit-data");
const { getTitleFacts } = await import("./stats-data");
const api = await import("./api");

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

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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

/**
 * Each of these fans out over TMDB on behalf of one section of one page. A
 * rejection reaching the caller would take the page down over a row that could
 * simply be absent, so every one of them answers with its own empty shape.
 */
describe("a failing section answers empty rather than throwing", () => {
  it("continue watching", async () => {
    vi.mocked(getContinueWatchingEpisodes).mockRejectedValue(new Error("x"));
    await expect(api.getContinueWatching({})).resolves.toEqual([]);
  });

  it("the tonight shortlist", async () => {
    vi.mocked(getTonightCandidates).mockRejectedValue(new Error("x"));
    await expect(api.getTonightShortlist([])).resolves.toEqual([]);
  });

  it("a rating duel", async () => {
    vi.mocked(pickRatingDuel).mockRejectedValue(new Error("x"));
    await expect(api.getRatingDuel([], false)).resolves.toBeNull();
  });

  it("the stats facts", async () => {
    vi.mocked(getTitleFacts).mockRejectedValue(new Error("x"));
    await expect(api.getWatchStatsFacts([])).resolves.toEqual({});
  });

  // This one keeps `today`: the calendar still has to know which day to draw as
  // today even when it has nothing to put on it.
  it("the release calendar, keeping the day it is drawn around", async () => {
    vi.mocked(getReleaseCalendarFor).mockRejectedValue(new Error("x"));

    await expect(api.getReleaseCalendar([])).resolves.toEqual({
      events: [],
      awaiting: [],
      today: TODAY,
      checked: 0,
      eligible: 0,
    });
  });
});
