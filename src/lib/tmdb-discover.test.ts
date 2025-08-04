import { beforeEach, describe, expect, it, vi } from "vitest";

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

const { buildFilteredUrl } = await import("./tmdb-discover");

/** The query half of a built URL, as something that can be asked questions. */
function paramsOf(url: string): URLSearchParams {
  return new URLSearchParams(url.split("?")[1] ?? "");
}

beforeEach(() => {
  settings.region = "US";
  settings.watchProviderFilter = "all";
  settings.selectedProviderIds = "";
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
    expect(params.get("with_watch_monetization_types")).toBe("flatrate");
  });

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
      buildFilteredUrl("/discover/movie", {}, { watchProviders: "350" }),
    );

    expect(params.get("with_watch_providers")).toBe("350");
    // No monetization type: a storefront such as Apple TV only rents and sells,
    // so a flatrate-only query there returns nothing at all.
    expect(params.has("with_watch_monetization_types")).toBe(false);
  });

  it("reads the 'mine' sentinel as the visitor's own platforms", () => {
    settings.selectedProviderIds = "8|337";

    const params = paramsOf(
      buildFilteredUrl("/discover/movie", {}, { watchProviders: "mine" }),
    );

    expect(params.get("with_watch_providers")).toBe("8|337");
    expect(params.get("with_watch_monetization_types")).toBe("flatrate");
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
