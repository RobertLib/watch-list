import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The TMDB client: which URL each call builds, and what it does to the answer.
 *
 * The transport underneath is `tmdb-cache.ts` and has its own suite, so it is
 * the one thing mocked here. Everything else stays real, because the two things
 * worth pinning are both about composition – which endpoints carry the visitor's
 * region and which deliberately do not, and how the two shapes TMDB returns for
 * "a title" are flattened into the one the app renders.
 */

vi.mock("./tmdb-cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./tmdb-cache")>()),
  tmdbFetchJson: vi.fn(),
}));

vi.mock("./settings", () => ({ getRegion: vi.fn(() => "US") }));

const { tmdbFetchJson } = await import("./tmdb-cache");
const { getRegion } = await import("./settings");
const { tmdbApi } = await import("./tmdb");

const fetchJson = vi.mocked(tmdbFetchJson);
const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  vi.useRealTimers();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

/** The URL the last call asked for. */
function lastUrl(): URL {
  return new URL(fetchJson.mock.calls.at(-1)![0]);
}

/** The TTL the last call asked for, in seconds. */
function lastTtl(): number | undefined {
  return fetchJson.mock.calls.at(-1)![1];
}

beforeEach(() => {
  fetchJson.mockReset();
  fetchJson.mockResolvedValue({ page: 1, results: [] });
  vi.mocked(getRegion).mockReturnValue("US");
});

describe("recommendation request options", () => {
  it.each(["movie", "tv"] as const)("forwards cancellation and priority for %s seeds", async (type) => {
    const options = { signal: new AbortController().signal, priority: "background" as const };
    if (type === "movie") await tmdbApi.getMovieRecommendations(42, options);
    else await tmdbApi.getTVShowRecommendations(42, options);

    expect(fetchJson).toHaveBeenCalledWith(
      `https://api.themoviedb.org/3/${type}/42/recommendations`,
      21600,
      options,
    );
  });
});

describe("listing URLs", () => {
  it("carries the visitor's region", async () => {
    vi.mocked(getRegion).mockReturnValue("GB");
    await tmdbApi.getNowPlayingMovies(2);

    const url = lastUrl();
    expect(url.pathname).toBe("/3/movie/now_playing");
    expect(url.searchParams.get("region")).toBe("GB");
    expect(url.searchParams.get("page")).toBe("2");
  });

  // An unknown region must not reach TMDB as itself: it falls back rather than
  // producing a request nobody can answer.
  it("falls back for a region that is not one", async () => {
    vi.mocked(getRegion).mockReturnValue("not-a-region");
    await tmdbApi.getPopularMovies();

    expect(lastUrl().searchParams.get("region")).toBe("US");
  });

  it("escapes a query rather than pasting it in", async () => {
    await tmdbApi.searchMulti("a&b=c d");

    expect(lastUrl().searchParams.get("query")).toBe("a&b=c d");
  });

  it("uses the visitor's timezone for airing today, independently of the catalogue region", async () => {
    process.env.TZ = "Europe/Prague";
    vi.mocked(getRegion).mockReturnValue("US");
    await tmdbApi.getAiringTodayTVShows(2);

    expect(lastUrl().pathname).toBe("/3/tv/airing_today");
    expect(lastUrl().searchParams.get("timezone")).toBe("Europe/Prague");
    expect(lastUrl().searchParams.get("page")).toBe("2");
  });

  it("does not reuse the airing-today cache URL after the visitor's timezone changes", async () => {
    process.env.TZ = "Europe/Prague";
    await tmdbApi.getAiringTodayTVShows();
    const pragueUrl = lastUrl().href;

    process.env.TZ = "America/Los_Angeles";
    await tmdbApi.getAiringTodayTVShows();

    expect(lastUrl().searchParams.get("timezone")).toBe("America/Los_Angeles");
    expect(lastUrl().href).not.toBe(pragueUrl);
  });
});

/**
 * The distinction the module is built around. TMDB varies nothing by country on
 * an endpoint addressed by a single id – a film's credits are its credits – so a
 * region in the URL only fragments the cache: changing region threw away detail
 * data for no reason, and `/tv/{id}/season/{n}` here missed the entry the cache
 * module builds for the identical request.
 */
describe("detail URLs", () => {
  it("carries no region", async () => {
    vi.mocked(getRegion).mockReturnValue("GB");
    await tmdbApi.getMovieDetails(550);

    const url = lastUrl();
    expect(url.pathname).toBe("/3/movie/550");
    expect(url.searchParams.get("region")).toBeNull();
    expect(url.search).toBe("");
  });

  it("passes append_to_response through when asked", async () => {
    await tmdbApi.getMovieDetails(550, "credits,videos");

    expect(lastUrl().searchParams.get("append_to_response")).toBe(
      "credits,videos",
    );
  });

  it("loads the person's exact external identity in the existing detail request", async () => {
    const details = { id: 491, name: "John Williams", external_ids: { wikidata_id: "Q131285" } };
    fetchJson.mockResolvedValueOnce(details);

    await expect(tmdbApi.getPersonDetails(491)).resolves.toBe(details);

    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(lastUrl().pathname).toBe("/3/person/491");
    expect(lastUrl().searchParams.get("append_to_response")).toBe("external_ids");
    expect(lastUrl().searchParams.get("region")).toBeNull();
  });

  it("matches the key the cache module builds for a season", async () => {
    await tmdbApi.getSeasonDetails(1399, 1);

    expect(lastUrl().pathname).toBe("/3/tv/1399/season/1");
  });

  // Season 0 is where TMDB keeps the specials, so the floor really does drop.
  it("allows season zero", async () => {
    await expect(tmdbApi.getSeasonDetails(1399, 0)).resolves.toBeDefined();
    expect(lastUrl().pathname).toBe("/3/tv/1399/season/0");
  });
});

/**
 * The ids come out of the URL bar and are interpolated into a *path*, where
 * nothing escapes them. "550/../person/123" would walk the request to an
 * endpoint the app never meant to call.
 */
describe("path ids", () => {
  // Every method here is `async`, so the guard surfaces as a rejection rather
  // than a synchronous throw – which is the right shape for the callers: a page
  // loads through `useAsyncData`, which catches a rejection and shows its error
  // state, where a throw would escape the effect entirely.
  it.each([0, -1, 1.5, NaN])("refuses %s as a title id", async (id) => {
    await expect(tmdbApi.getMovieDetails(id)).rejects.toThrow(
      /Invalid movieId/,
    );
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it("refuses a negative season", async () => {
    await expect(tmdbApi.getSeasonDetails(1399, -1)).rejects.toThrow(
      /Invalid seasonNumber/,
    );
  });

  it("guards person and collection ids too", async () => {
    await expect(tmdbApi.getPersonDetails(0)).rejects.toThrow(
      /Invalid personId/,
    );
    await expect(tmdbApi.getCollectionDetails(-5)).rejects.toThrow(
      /Invalid collectionId/,
    );
  });
});

describe("getTrending", () => {
  it("flattens a show into the shape a card renders", async () => {
    fetchJson.mockResolvedValue({
      page: 1,
      total_pages: 1,
      total_results: 2,
      results: [
        { id: 1, title: "A Film", release_date: "1999-03-31", media_type: "movie" },
        { id: 2, name: "A Show", first_air_date: "2011-04-17", media_type: "tv" },
      ],
    });

    const { results } = await tmdbApi.getTrending();

    expect(results[0]).toMatchObject({
      title: "A Film",
      release_date: "1999-03-31",
      media_type: "movie",
    });
    expect(results[1]).toMatchObject({
      title: "A Show",
      release_date: "2011-04-17",
      media_type: "tv",
    });
  });

  // A `MediaItem` promises a string for its date. A series TMDB has no premiere
  // for arrives with `first_air_date: null`, and used to be passed on as such.
  it("folds a null air date into the empty string a card expects", async () => {
    fetchJson.mockResolvedValue({
      page: 1,
      results: [{ id: 2, name: "Unaired", first_air_date: null, media_type: "tv" }],
    });

    const { results } = await tmdbApi.getTrending();

    expect(results[0].release_date).toBe("");
  });

  // A row that is neither shape – TMDB has labelled people "tv" before – has no
  // date field at all, which used to put `undefined` into a string field.
  it("gives a row with no date field an empty date rather than undefined", async () => {
    fetchJson.mockResolvedValue({
      page: 1,
      results: [{ id: 3, name: "Someone", media_type: "tv" }],
    });

    const { results } = await tmdbApi.getTrending();

    expect(results[0].release_date).toBe("");
  });

  it("drops trending people instead of routing and saving them as shows", async () => {
    fetchJson.mockResolvedValue({
      page: 1,
      results: [
        { id: 3, name: "Someone", media_type: "person" },
        { id: 4, title: "A Film", media_type: "movie" },
        { id: 5, name: "A Show", media_type: "tv" },
        { id: 6, name: "Unknown", media_type: "other" },
      ],
    });

    const { results } = await tmdbApi.getTrending();
    expect(results.map((item) => [item.id, item.media_type])).toEqual([
      [4, "movie"],
      [5, "tv"],
    ]);
  });
});

describe("searchMulti", () => {
  it("drops the people and keeps the titles", async () => {
    fetchJson.mockResolvedValue({
      page: 1,
      total_pages: 1,
      total_results: 3,
      results: [
        { id: 1, title: "A Film", media_type: "movie" },
        { id: 2, name: "An Actor", media_type: "person" },
        { id: 3, name: "A Show", media_type: "tv" },
      ],
    });

    const { results } = await tmdbApi.searchMulti("a");

    expect(results.map((item) => item.id)).toEqual([1, 3]);
  });

  /**
   * The totals are passed through untouched on purpose, and they describe the
   * *unfiltered* answer. Correcting them would page over a set TMDB will not
   * serve: page 2 is page 2 whatever page 1 filtered out.
   */
  it("leaves the totals describing what TMDB actually counted", async () => {
    fetchJson.mockResolvedValue({
      page: 1,
      total_pages: 4,
      total_results: 80,
      results: [{ id: 2, name: "An Actor", media_type: "person" }],
    });

    const response = await tmdbApi.searchMulti("a");

    expect(response.results).toEqual([]);
    expect(response.total_results).toBe(80);
    expect(response.total_pages).toBe(4);
  });
});

describe("searchMultiWithPeople", () => {
  it("keeps later-page people alongside normalized titles in one request", async () => {
    fetchJson.mockResolvedValue({
      page: 2,
      total_pages: 500,
      total_results: 10000,
      results: [
        { id: 1, title: "A Film", release_date: "2000-01-01", media_type: "movie" },
        { id: 2, name: "An Actor", media_type: "person" },
        { id: 3, name: "A Show", first_air_date: null, media_type: "tv" },
      ],
    });

    const response = await tmdbApi.searchMultiWithPeople("John", 2);

    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(lastUrl().pathname).toBe("/3/search/multi");
    expect(lastUrl().searchParams.get("query")).toBe("John");
    expect(lastUrl().searchParams.get("page")).toBe("2");
    expect(response.people.map((item) => item.id)).toEqual([2]);
    expect(response.results.map((item) => [item.id, item.title, item.release_date, item.media_type])).toEqual([
      [1, "A Film", "2000-01-01", "movie"],
      [3, "A Show", "", "tv"],
    ]);
    expect(response.total_results).toBe(10000);
    expect(response.total_pages).toBe(500);
  });

  it("shares the same transport URL with the header's title-only search", async () => {
    await tmdbApi.searchMulti("a&b", 3);
    await tmdbApi.searchMultiWithPeople("a&b", 3);

    expect(fetchJson.mock.calls[0]).toEqual(fetchJson.mock.calls[1]);
  });
});

describe("cache lifetimes", () => {
  // Named for what they are about: a genre list is effectively fixed, what is
  // airing today is not.
  it("asks for a day on a genre list and an hour on a listing", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 6, 12));
    await tmdbApi.getMovieGenres();
    expect(lastTtl()).toBe(86400);

    await tmdbApi.getAiringTodayTVShows();
    expect(lastTtl()).toBe(3600);
  });

  it("expires the airing-today programme at local midnight", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 6, 23, 55));

    await tmdbApi.getAiringTodayTVShows();

    expect(lastTtl()).toBe(300);
  });
});
