import { beforeEach, describe, expect, it, vi } from "vitest";

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

  // Anything TMDB labels neither "movie" nor "tv" is rendered as a show rather
  // than left to reach a card as a media type nothing routes.
  it("normalises an unexpected media type to tv", async () => {
    fetchJson.mockResolvedValue({
      page: 1,
      results: [{ id: 3, name: "Someone", media_type: "person" }],
    });

    const { results } = await tmdbApi.getTrending();
    expect(results[0].media_type).toBe("tv");
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
   * serve: page 2 is page 2 whatever page 1 filtered out. `SearchContent`
   * subtracts the person total when it needs a count of titles.
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

describe("cache lifetimes", () => {
  // Named for what they are about: a genre list is effectively fixed, what is
  // airing today is not.
  it("asks for a day on a genre list and an hour on a listing", async () => {
    await tmdbApi.getMovieGenres();
    expect(lastTtl()).toBe(86400);

    await tmdbApi.getAiringTodayTVShows();
    expect(lastTtl()).toBe(3600);
  });
});
