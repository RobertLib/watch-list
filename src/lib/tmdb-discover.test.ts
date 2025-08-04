import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDiscoverFilterQuery,
  discoverFiltersToFilterOptions,
  EMPTY_DISCOVER_FILTERS,
  parseDiscoverFilters,
  resolveDiscoverFilters,
  sanitizeFilterOptions,
} from "./discover-filters";
import { ANY_PROVIDERS } from "./watch-provider-settings";
import { getTVPresets } from "./filter-presets";

/**
 * The URL these build is also the cache key, so a wrong parameter is a wrong
 * answer that then gets remembered for the TTL. The settings module is mocked
 * rather than driven through storage: what matters here is that a given region
 * and platform choice produces a given query, not how the choice was stored.
 */
const settings = vi.hoisted(() => ({
  region: "US",
  watchProviderFilter: "all" as "all" | "streaming-only",
  selectedProviderIds: "",
}));

vi.mock("./settings", () => ({
  getRegion: () => settings.region,
  getWatchProviderFilter: () => settings.watchProviderFilter,
  getSelectedProviderIdsString: () => settings.selectedProviderIds,
}));

const request = vi.hoisted(() => vi.fn());
vi.mock("./tmdb-cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./tmdb-cache")>()),
  tmdbFetchJson: request,
  getCachedDiscoveryRequest: request,
}));

const { buildFilteredUrl, tmdbDiscoverApi } = await import("./tmdb-discover");
const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  vi.useRealTimers();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

/** The query half of a built URL, as something that can be asked questions. */
function paramsOf(url: string): URLSearchParams {
  return new URLSearchParams(url.split("?")[1] ?? "");
}

beforeEach(() => {
  settings.region = "US";
  settings.watchProviderFilter = "all";
  settings.selectedProviderIds = "";
  request.mockReset();
  request.mockResolvedValue({ page: 2, results: [], total_pages: 1, total_results: 0 });
});

describe("discovery request options", () => {
  it.each(["movie", "tv"] as const)("forwards cancellation and priority for %s top-ups", async (type) => {
    const options = { signal: new AbortController().signal, priority: "background" as const };
    if (type === "movie") await tmdbDiscoverApi.discoverMovies(2, { genre: "18" }, options);
    else await tmdbDiscoverApi.discoverTVShows(2, { genre: "18" }, options);

    const [url, forwarded] = request.mock.calls[0];
    expect(new URL(url).pathname).toBe(`/3/discover/${type}`);
    expect(paramsOf(url).get("with_genres")).toBe("18");
    expect(forwarded).toBe(options);
  });
});

describe("catalogue selection without platforms", () => {
  const listings = [
    ["now playing", () => tmdbDiscoverApi.getNowPlayingMovies(2), "/3/movie/now_playing", "/3/discover/movie"],
    ["upcoming", () => tmdbDiscoverApi.getUpcomingMovies(2), "/3/movie/upcoming", "/3/discover/movie"],
    ["airing today", () => tmdbDiscoverApi.getAiringTodayTVShows(2), "/3/tv/airing_today", "/3/discover/tv"],
    ["trending films", () => tmdbDiscoverApi.getTrendingMoviesWeekly(2), "/3/trending/movie/week", "/3/discover/movie"],
    ["trending series", () => tmdbDiscoverApi.getTrendingTVShowsWeekly(2), "/3/trending/tv/week", "/3/discover/tv"],
    ["mixed trending", () => tmdbDiscoverApi.getTrending("all", "day"), "/3/trending/all/day", "/3/discover/movie"],
  ] as const;

  it.each(listings)("keeps the same %s catalogue when the platform selection is empty", async (_, load, endpoint) => {
    settings.region = "CZ";
    await load();
    const unfilteredUrls = request.mock.calls.map(([url]) => url);
    expect(new URL(unfilteredUrls[0]).pathname).toBe(endpoint);

    request.mockClear();
    settings.watchProviderFilter = "streaming-only";
    await load();

    expect(request.mock.calls.map(([url]) => url)).toEqual(unfilteredUrls);
  });

  it.each(listings)("filters %s only after a platform is picked and restores the catalogue after clearing it", async (_, load, endpoint, discoveryEndpoint) => {
    settings.region = "CZ";
    settings.watchProviderFilter = "streaming-only";
    settings.selectedProviderIds = "8|337";
    await load();

    const url = new URL(request.mock.calls[0][0]);
    expect(url.pathname).toBe(discoveryEndpoint);
    expect(url.searchParams.get("with_watch_providers")).toBe("8|337");
    expect(url.searchParams.get("watch_region")).toBe("CZ");
    expect(url.searchParams.get("with_watch_monetization_types")).toBe("flatrate|free|ads");

    request.mockClear();
    settings.selectedProviderIds = "";
    await load();

    expect(request).toHaveBeenCalledTimes(1);
    expect(new URL(request.mock.calls[0][0]).pathname).toBe(endpoint);
  });

  it("ignores saved platform choices when the visitor asks for everything", async () => {
    settings.selectedProviderIds = "8";
    await tmdbDiscoverApi.getUpcomingMovies(3);
    const url = new URL(request.mock.calls[0][0]);

    expect(url.pathname).toBe("/3/movie/upcoming");
    expect(url.searchParams.get("page")).toBe("3");
    expect(url.searchParams.has("with_watch_providers")).toBe(false);
  });
});

describe("airing today in the visitor's timezone", () => {
  it.each([
    ["Europe/Prague", "2026-10-05"],
    ["America/Los_Angeles", "2026-10-04"],
  ])("keeps the %s timezone when the visitor filters to their platforms", async (timezone, today) => {
    process.env.TZ = timezone;
    vi.useFakeTimers();
    // Prague has crossed midnight while Los Angeles is still on yesterday.
    vi.setSystemTime(new Date("2026-10-04T22:30:00.000Z"));
    settings.region = "CZ";

    await tmdbDiscoverApi.getAiringTodayTVShows(2);
    const fullUrl = new URL(request.mock.calls.at(-1)![0]);

    settings.watchProviderFilter = "streaming-only";
    settings.selectedProviderIds = "8|337";
    await tmdbDiscoverApi.getAiringTodayTVShows(2);
    const filteredUrl = new URL(request.mock.calls.at(-1)![0]);

    expect(fullUrl.pathname).toBe("/3/tv/airing_today");
    expect(fullUrl.searchParams.get("timezone")).toBe(timezone);
    expect(filteredUrl.pathname).toBe("/3/discover/tv");
    expect(filteredUrl.searchParams.get("timezone")).toBe(timezone);
    expect(filteredUrl.searchParams.get("air_date.gte")).toBe(today);
    expect(filteredUrl.searchParams.get("air_date.lte")).toBe(today);
    expect(filteredUrl.searchParams.get("with_watch_providers")).toBe("8|337");
    expect(filteredUrl.searchParams.get("watch_region")).toBe("CZ");
    expect(filteredUrl.searchParams.get("page")).toBe("2");
  });

  it("uses a distinct filtered cache URL in each timezone even on the same day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T12:00:00.000Z"));
    settings.watchProviderFilter = "streaming-only";
    settings.selectedProviderIds = "8";

    process.env.TZ = "Europe/Prague";
    await tmdbDiscoverApi.getAiringTodayTVShows();
    const pragueUrl = request.mock.calls.at(-1)![0];

    process.env.TZ = "America/Los_Angeles";
    await tmdbDiscoverApi.getAiringTodayTVShows();
    const losAngelesUrl = request.mock.calls.at(-1)![0];

    expect(paramsOf(pragueUrl).get("air_date.gte")).toBe("2026-10-05");
    expect(paramsOf(losAngelesUrl).get("air_date.gte")).toBe("2026-10-05");
    expect(paramsOf(losAngelesUrl).get("timezone")).toBe("America/Los_Angeles");
    expect(losAngelesUrl).not.toBe(pragueUrl);
  });
});

describe("buildFilteredUrl", () => {
  it("points at the endpoint it was given", () => {
    const url = buildFilteredUrl("/discover/movie", { page: 1 });

    expect(url.startsWith("https://api.themoviedb.org/3/discover/movie?")).toBe(
      true,
    );
    expect(paramsOf(url).get("page")).toBe("1");
  });

  it("always carries the region", () => {
    expect(paramsOf(buildFilteredUrl("/discover/movie")).get("region")).toBe(
      "US",
    );

    settings.region = "CZ";
    expect(paramsOf(buildFilteredUrl("/discover/movie")).get("region")).toBe(
      "CZ",
    );
  });

  it("escapes a parameter that would otherwise break the query", () => {
    const params = paramsOf(
      buildFilteredUrl("/search/movie", { query: "a&b=c d" }),
    );

    expect(params.get("query")).toBe("a&b=c d");
  });

  it("keeps the zero-valued Returning Series status confined to TV discovery", () => {
    expect(paramsOf(buildFilteredUrl("/discover/tv", {}, { withStatus: 0 })).get("with_status")).toBe("0");
    expect(paramsOf(buildFilteredUrl("/discover/movie", {}, { withStatus: 0 })).has("with_status")).toBe(false);
  });
});

describe("Trending Series preset", () => {
  it.each([false, true])("requests still-running shows of any premiere year on later pages, streaming-only=%s", async (streamingOnly) => {
    settings.watchProviderFilter = streamingOnly ? "streaming-only" : "all";
    settings.selectedProviderIds = streamingOnly ? "8|337" : "";
    const resolved = resolveDiscoverFilters(
      new URLSearchParams({ preset: "trending-series" }),
      "tv",
      getTVPresets("2026-10-06"),
    );

    await tmdbDiscoverApi.discoverTVShows(2, sanitizeFilterOptions(resolved.options, "tv"));

    const url = new URL(request.mock.calls[0][0]);
    expect(resolved.isActive).toBe(true);
    expect(url.pathname).toBe("/3/discover/tv");
    expect(url.searchParams.get("with_status")).toBe("0");
    expect(url.searchParams.get("sort_by")).toBe("popularity.desc");
    expect(url.searchParams.get("first_air_date.lte")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(url.searchParams.has("first_air_date.gte")).toBe(false);
    expect(url.searchParams.has("first_air_date_year")).toBe(false);
    expect(url.searchParams.get("vote_count.gte")).toBe("50");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("with_watch_providers")).toBe(streamingOnly ? "8|337" : null);
  });
});

describe("year, which is a different parameter per media type", () => {
  it("is a primary release year for films", () => {
    const params = paramsOf(
      buildFilteredUrl("/discover/movie", {}, { year: "2026" }),
    );

    expect(params.get("primary_release_year")).toBe("2026");
    expect(params.has("first_air_date_year")).toBe(false);
  });

  it("is a first air date year for series", () => {
    const params = paramsOf(
      buildFilteredUrl("/discover/tv", {}, { year: "2026" }),
    );

    expect(params.get("first_air_date_year")).toBe("2026");
    expect(params.has("primary_release_year")).toBe(false);
  });

  it("is left off an endpoint that is neither", () => {
    const params = paramsOf(
      buildFilteredUrl("/trending/all/week", {}, { year: "2026" }),
    );

    expect(params.has("primary_release_year")).toBe(false);
    expect(params.has("first_air_date_year")).toBe(false);
  });
});

describe("platform filtering", () => {
  it("asks for nothing in particular by default", () => {
    const params = paramsOf(buildFilteredUrl("/discover/movie"));

    expect(params.has("with_watch_providers")).toBe(false);
    expect(params.has("watch_region")).toBe(false);
  });

  it("narrows to the visitor's platforms when they asked for that", () => {
    settings.watchProviderFilter = "streaming-only";
    settings.selectedProviderIds = "8|337";

    const params = paramsOf(buildFilteredUrl("/discover/movie"));

    expect(params.get("with_watch_providers")).toBe("8|337");
    expect(params.get("watch_region")).toBe("US");
    expect(params.get("with_watch_monetization_types")).toBe("flatrate|free|ads");
  });

  it.each(["movie", "tv"] as const)(
    "keeps an explicit Any Platform choice through a bookmarked %s URL and the TMDB request",
    async (type) => {
      settings.watchProviderFilter = "streaming-only";
      settings.selectedProviderIds = "8|337";
      const query = buildDiscoverFilterQuery({
        ...EMPTY_DISCOVER_FILTERS,
        provider: ANY_PROVIDERS,
      }, 2);
      const filters = parseDiscoverFilters(new URLSearchParams(query), type);
      const options = sanitizeFilterOptions(
        discoverFiltersToFilterOptions(filters, type),
        type,
      );

      if (type === "movie") await tmdbDiscoverApi.discoverMovies(2, options);
      else await tmdbDiscoverApi.discoverTVShows(2, options);

      const params = paramsOf(request.mock.calls[0][0]);
      expect(params.get("page")).toBe("2");
      expect(params.has("with_watch_providers")).toBe(false);
      expect(params.has("watch_region")).toBe(false);
      expect(params.has("with_watch_monetization_types")).toBe(false);
    },
  );

  it("does not filter to an empty set of platforms", () => {
    // "Streaming only" with nothing selected would otherwise ask TMDB for
    // titles on no platform at all, which answers with an empty page.
    settings.watchProviderFilter = "streaming-only";
    settings.selectedProviderIds = "";

    expect(
      paramsOf(buildFilteredUrl("/discover/movie")).has("with_watch_providers"),
    ).toBe(false);
  });

  it("lets a platform picked in the filter bar override the profile setting", () => {
    settings.watchProviderFilter = "streaming-only";
    settings.selectedProviderIds = "8";

    const params = paramsOf(
      buildFilteredUrl("/discover/movie", {}, { watchProviders: "2" }),
    );

    expect(params.get("with_watch_providers")).toBe("2");
    // No monetization type: a storefront such as Apple TV only rents and sells,
    // so a flatrate-only query there returns nothing at all.
    expect(params.has("with_watch_monetization_types")).toBe(false);
  });

  it.each(["movie", "tv"])("includes paid and free streaming for the 'mine' %s filter", (type) => {
    settings.selectedProviderIds = "8|300|207";

    const params = paramsOf(
      buildFilteredUrl(`/discover/${type}`, {}, { watchProviders: "mine" }),
    );

    expect(params.get("with_watch_providers")).toBe("8|300|207");
    expect(params.get("with_watch_monetization_types")).toBe("flatrate|free|ads");
  });

  it("drops a provider value that is not a provider", () => {
    // The value arrives straight off the URL bar.
    const params = paramsOf(
      buildFilteredUrl(
        "/discover/movie",
        {},
        { watchProviders: "netflix; drop table" },
      ),
    );

    expect(params.has("with_watch_providers")).toBe(false);
  });
});

describe("the rest of the filter bar", () => {
  it("maps each filter onto the parameter TMDB names it with", () => {
    const params = paramsOf(
      buildFilteredUrl(
        "/discover/movie",
        {},
        {
          sortBy: "vote_average.desc",
          genre: "27",
          minRating: 7.5,
          withOriginalLanguage: "cs",
          primaryReleaseDateGte: "2026-01-01",
          primaryReleaseDateLte: "2026-12-31",
          voteCountGte: 100,
          voteCountLte: 5000,
          popularityLte: 40,
          withRuntimeGte: 60,
          withRuntimeLte: 150,
          withKeywords: "818",
        },
      ),
    );

    expect(Object.fromEntries(params)).toMatchObject({
      sort_by: "vote_average.desc",
      with_genres: "27",
      "vote_average.gte": "7.5",
      with_original_language: "cs",
      "primary_release_date.gte": "2026-01-01",
      "primary_release_date.lte": "2026-12-31",
      "vote_count.gte": "100",
      "vote_count.lte": "5000",
      "popularity.lte": "40",
      "with_runtime.gte": "60",
      "with_runtime.lte": "150",
      with_keywords: "818",
    });
  });

  it("maps the air-date window for series", () => {
    const params = paramsOf(
      buildFilteredUrl(
        "/discover/tv",
        {},
        { firstAirDateGte: "2026-01-01", firstAirDateLte: "2026-12-31" },
      ),
    );

    expect(params.get("first_air_date.gte")).toBe("2026-01-01");
    expect(params.get("first_air_date.lte")).toBe("2026-12-31");
  });

  it("leaves out every filter that was not set", () => {
    const params = paramsOf(buildFilteredUrl("/discover/movie", { page: 2 }));

    expect([...params.keys()].sort()).toEqual(["page", "region"]);
  });
});
