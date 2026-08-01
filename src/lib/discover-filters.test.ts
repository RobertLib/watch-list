import { describe, expect, it } from "vitest";
import {
  MAX_TMDB_PAGE,
  buildDiscoverFilterQuery,
  discoverFiltersToFilterOptions,
  EMPTY_DISCOVER_FILTERS,
  formatResultCount,
  hasActiveDiscoverFilters,
  parseDiscoverFilters,
  sanitizeFilterOptions,
  sanitizePage,
} from "./discover-filters";
import { MY_PROVIDERS } from "./watch-provider-settings";

const CURRENT_YEAR = new Date().getFullYear();

describe("sanitizePage", () => {
  it("keeps a page TMDB would accept", () => {
    expect(sanitizePage(1)).toBe(1);
    expect(sanitizePage(7)).toBe(7);
    expect(sanitizePage("12")).toBe(12);
  });

  it("clamps to the range TMDB serves", () => {
    expect(sanitizePage(0)).toBe(1);
    expect(sanitizePage(-5)).toBe(1);
    expect(sanitizePage(9999)).toBe(MAX_TMDB_PAGE);
  });

  it("falls back to the first page for anything unparseable", () => {
    expect(sanitizePage("abc")).toBe(1);
    expect(sanitizePage(NaN)).toBe(1);
    expect(sanitizePage(Infinity)).toBe(1);
    expect(sanitizePage(undefined)).toBe(1);
    expect(sanitizePage(null)).toBe(1);
    expect(sanitizePage({})).toBe(1);
    expect(sanitizePage([])).toBe(1);
  });

  it("truncates rather than rounding, so a page is always an integer", () => {
    expect(sanitizePage(2.9)).toBe(2);
    expect(Number.isInteger(sanitizePage(2.9))).toBe(true);
  });
});

describe("parseDiscoverFilters", () => {
  it("returns nothing active for an empty query", () => {
    const filters = parseDiscoverFilters({}, "movie");
    expect(filters).toEqual(EMPTY_DISCOVER_FILTERS);
    expect(hasActiveDiscoverFilters(filters)).toBe(false);
  });

  it("keeps values that are on the allow-list", () => {
    const filters = parseDiscoverFilters(
      {
        sort_by: "vote_average.desc",
        year: String(CURRENT_YEAR),
        min_rating: "8",
        language: "cs",
        genre: "28",
        provider: "8",
      },
      "movie",
    );

    expect(filters).toEqual({
      sortBy: "vote_average.desc",
      year: String(CURRENT_YEAR),
      minRating: "8",
      language: "cs",
      genre: "28",
      provider: "8",
    });
    expect(hasActiveDiscoverFilters(filters)).toBe(true);
  });

  it("drops values that are not", () => {
    const filters = parseDiscoverFilters(
      {
        sort_by: "revenue.desc; DROP TABLE",
        year: "1800",
        min_rating: "11",
        language: "xx",
        genre: "-3",
        provider: "abc",
      },
      "movie",
    );

    expect(filters).toEqual(EMPTY_DISCOVER_FILTERS);
  });

  it("rejects a sort that belongs to the other media type", () => {
    expect(parseDiscoverFilters({ sort_by: "title.asc" }, "movie").sortBy).toBe(
      "title.asc",
    );
    expect(parseDiscoverFilters({ sort_by: "title.asc" }, "tv").sortBy).toBe("");
    expect(
      parseDiscoverFilters({ sort_by: "first_air_date.desc" }, "tv").sortBy,
    ).toBe("first_air_date.desc");
    expect(
      parseDiscoverFilters({ sort_by: "first_air_date.desc" }, "movie").sortBy,
    ).toBe("");
  });

  // The default is what you get without a query string, so keeping it out of the
  // URL is what stops /movies and /movies?sort_by=popularity.desc from splitting
  // into two indexable pages.
  it("normalises the default sort away", () => {
    expect(
      parseDiscoverFilters({ sort_by: "popularity.desc" }, "movie").sortBy,
    ).toBe("");
  });

  it("reads the genre from the alternate key on genre pages", () => {
    expect(
      parseDiscoverFilters({ with_genre: "28" }, "movie", "with_genre").genre,
    ).toBe("28");
    expect(parseDiscoverFilters({ genre: "28" }, "movie", "with_genre").genre).toBe(
      "",
    );
  });

  it("accepts a URLSearchParams as well as a plain object", () => {
    const params = new URLSearchParams({ min_rating: "7", language: "ja" });
    expect(parseDiscoverFilters(params, "movie")).toMatchObject({
      minRating: "7",
      language: "ja",
    });
  });

  it("passes the profile sentinel through as a provider", () => {
    expect(parseDiscoverFilters({ provider: MY_PROVIDERS }, "movie").provider).toBe(
      MY_PROVIDERS,
    );
  });
});

describe("discoverFiltersToFilterOptions", () => {
  it("omits every filter that is not set", () => {
    expect(
      discoverFiltersToFilterOptions(EMPTY_DISCOVER_FILTERS, "movie"),
    ).toEqual({});
  });

  // Without a vote floor the rating filters surface titles rated 10/10 by four
  // people, which is what the floor exists to prevent.
  it("adds a vote floor whenever rating drives the result set", () => {
    expect(
      discoverFiltersToFilterOptions(
        { ...EMPTY_DISCOVER_FILTERS, minRating: "8" },
        "movie",
      ).voteCountGte,
    ).toBe(200);

    expect(
      discoverFiltersToFilterOptions(
        { ...EMPTY_DISCOVER_FILTERS, sortBy: "vote_average.desc" },
        "movie",
      ).voteCountGte,
    ).toBe(200);

    expect(
      discoverFiltersToFilterOptions(
        { ...EMPTY_DISCOVER_FILTERS, sortBy: "popularity.desc" },
        "movie",
      ).voteCountGte,
    ).toBeUndefined();
  });

  it("caps the current year at today so unreleased titles stay out", () => {
    const movie = discoverFiltersToFilterOptions(
      { ...EMPTY_DISCOVER_FILTERS, year: String(CURRENT_YEAR) },
      "movie",
    );
    expect(movie.primaryReleaseDateLte).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(movie.firstAirDateLte).toBeUndefined();

    const tv = discoverFiltersToFilterOptions(
      { ...EMPTY_DISCOVER_FILTERS, year: String(CURRENT_YEAR) },
      "tv",
    );
    expect(tv.firstAirDateLte).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(tv.primaryReleaseDateLte).toBeUndefined();
  });

  it("leaves a past year uncapped", () => {
    expect(
      discoverFiltersToFilterOptions(
        { ...EMPTY_DISCOVER_FILTERS, year: "1999" },
        "movie",
      ).primaryReleaseDateLte,
    ).toBeUndefined();
  });
});

describe("buildDiscoverFilterQuery", () => {
  it("produces an empty string when there is nothing to carry", () => {
    expect(buildDiscoverFilterQuery(EMPTY_DISCOVER_FILTERS)).toBe("");
  });

  it("leaves page 1 out of the URL", () => {
    expect(buildDiscoverFilterQuery(EMPTY_DISCOVER_FILTERS, 1)).toBe("");
    expect(buildDiscoverFilterQuery(EMPTY_DISCOVER_FILTERS, 3)).toBe("?page=3");
  });

  it("round-trips through parseDiscoverFilters", () => {
    const filters = {
      sortBy: "vote_average.desc",
      year: "1999",
      minRating: "8",
      language: "ja",
      genre: "28",
      provider: "8",
    };
    const query = buildDiscoverFilterQuery(filters, 2);

    expect(parseDiscoverFilters(new URLSearchParams(query), "movie")).toEqual(
      filters,
    );
  });

  it("uses the alternate genre key when asked to", () => {
    const query = buildDiscoverFilterQuery(
      { ...EMPTY_DISCOVER_FILTERS, genre: "28" },
      1,
      "with_genre",
    );
    expect(query).toBe("?with_genre=28");
  });
});

describe("sanitizeFilterOptions", () => {
  it("rebuilds a legitimate payload unchanged", () => {
    const filters = {
      sortBy: "vote_average.desc",
      year: "1999",
      genre: "28,12",
      minRating: 7.5,
      voteCountGte: 200,
      primaryReleaseDateLte: "2014-12-31",
      withOriginalLanguage: "ja",
      watchProviders: "8|337",
    };

    expect(sanitizeFilterOptions(filters, "movie")).toEqual(filters);
  });

  it("returns nothing for a payload that is not an object", () => {
    expect(sanitizeFilterOptions(null, "movie")).toEqual({});
    expect(sanitizeFilterOptions(undefined, "movie")).toEqual({});
    expect(sanitizeFilterOptions("sortBy=x", "movie")).toEqual({});
    expect(sanitizeFilterOptions(42, "movie")).toEqual({});
  });

  it("silently drops fields it does not know", () => {
    expect(
      sanitizeFilterOptions(
        { withCast: "1", api_key: "leak", region: "GB", page: 3 },
        "movie",
      ),
    ).toEqual({});
  });

  // Whatever deserialises the action payload could hand us an object with a
  // prototype; an inherited field still has to clear the same allow-list.
  it("holds inherited fields to the same allow-list", () => {
    const inherited = Object.create({
      sortBy: "revenue.desc",
      genre: "not-a-genre",
    });

    expect(sanitizeFilterOptions(inherited, "movie")).toEqual({
      sortBy: "revenue.desc",
    });
  });

  it("rejects a sort that is not on the media type's allow-list", () => {
    expect(
      sanitizeFilterOptions({ sortBy: "revenue.desc" }, "movie").sortBy,
    ).toBe("revenue.desc");
    expect(
      sanitizeFilterOptions({ sortBy: "revenue.desc" }, "tv").sortBy,
    ).toBeUndefined();
    expect(
      sanitizeFilterOptions({ sortBy: "popularity.desc; --" }, "movie").sortBy,
    ).toBeUndefined();
  });

  it("only accepts a year TMDB has films for", () => {
    expect(sanitizeFilterOptions({ year: "1999" }, "movie").year).toBe("1999");
    expect(sanitizeFilterOptions({ year: 1999 }, "movie").year).toBe("1999");
    expect(sanitizeFilterOptions({ year: "1800" }, "movie").year).toBeUndefined();
    expect(
      sanitizeFilterOptions({ year: String(CURRENT_YEAR + 5) }, "movie").year,
    ).toBeUndefined();
    expect(sanitizeFilterOptions({ year: "abc" }, "movie").year).toBeUndefined();
  });

  it("bounds the genre list, which TMDB ANDs together", () => {
    expect(sanitizeFilterOptions({ genre: "28,12,16" }, "movie").genre).toBe(
      "28,12,16",
    );
    expect(sanitizeFilterOptions({ genre: "28,abc,-1,0" }, "movie").genre).toBe(
      "28",
    );
    expect(
      sanitizeFilterOptions({ genre: "1,2,3,4,5,6,7,8,9" }, "movie").genre,
    ).toBe("1,2,3,4,5");
    expect(sanitizeFilterOptions({ genre: "abc" }, "movie").genre).toBeUndefined();
    expect(sanitizeFilterOptions({ genre: [28] }, "movie").genre).toBeUndefined();
  });

  it("clamps a rating into the range TMDB scores on", () => {
    expect(sanitizeFilterOptions({ minRating: 7.5 }, "movie").minRating).toBe(7.5);
    expect(sanitizeFilterOptions({ minRating: 99 }, "movie").minRating).toBe(10);
    expect(sanitizeFilterOptions({ minRating: -5 }, "movie").minRating).toBe(0);
    expect(
      sanitizeFilterOptions({ minRating: "abc" }, "movie").minRating,
    ).toBeUndefined();
  });

  it("accepts only a real calendar date", () => {
    expect(
      sanitizeFilterOptions({ primaryReleaseDateGte: "2024-02-29" }, "movie")
        .primaryReleaseDateGte,
    ).toBe("2024-02-29");
    // 2025 is not a leap year, and `new Date` would roll this into March.
    expect(
      sanitizeFilterOptions({ primaryReleaseDateGte: "2025-02-29" }, "movie")
        .primaryReleaseDateGte,
    ).toBeUndefined();
    expect(
      sanitizeFilterOptions({ primaryReleaseDateGte: "2024-13-01" }, "movie")
        .primaryReleaseDateGte,
    ).toBeUndefined();
    expect(
      sanitizeFilterOptions({ primaryReleaseDateGte: "01/02/2024" }, "movie")
        .primaryReleaseDateGte,
    ).toBeUndefined();
    expect(
      sanitizeFilterOptions({ primaryReleaseDateGte: "2024-1-1" }, "movie")
        .primaryReleaseDateGte,
    ).toBeUndefined();
  });

  it("clamps the count and popularity bounds", () => {
    expect(
      sanitizeFilterOptions({ voteCountGte: 5000 }, "movie").voteCountGte,
    ).toBe(5000);
    expect(sanitizeFilterOptions({ voteCountGte: -1 }, "movie").voteCountGte).toBe(
      0,
    );
    expect(
      sanitizeFilterOptions({ voteCountGte: 1e12 }, "movie").voteCountGte,
    ).toBe(10_000_000);
    expect(
      sanitizeFilterOptions({ popularityLte: 1e12 }, "movie").popularityLte,
    ).toBe(1_000_000);
    expect(
      sanitizeFilterOptions({ voteCountLte: Infinity }, "movie").voteCountLte,
    ).toBeUndefined();
  });

  it("runs the provider filter through the same sanitizer as the URL", () => {
    expect(
      sanitizeFilterOptions({ watchProviders: "8,337" }, "movie").watchProviders,
    ).toBe("8|337");
    expect(
      sanitizeFilterOptions({ watchProviders: MY_PROVIDERS }, "movie")
        .watchProviders,
    ).toBe(MY_PROVIDERS);
    expect(
      sanitizeFilterOptions({ watchProviders: "abc" }, "movie").watchProviders,
    ).toBeUndefined();
  });

  // The result feeds a Next cache tag, and Next drops tags over 256 characters.
  it("produces a payload short enough to survive as a cache tag", () => {
    const hostile = {
      sortBy: "x".repeat(500),
      genre: Array.from({ length: 500 }, (_, i) => i + 1).join(","),
      watchProviders: Array.from({ length: 500 }, (_, i) => i + 1).join(","),
      primaryReleaseDateGte: "9".repeat(500),
      voteCountGte: Number.MAX_SAFE_INTEGER,
    };

    const sanitized = sanitizeFilterOptions(hostile, "movie");
    const asTag = Object.entries(sanitized)
      .map(([key, value]) => `${key}-${value}`)
      .join("_");

    expect(asTag.length).toBeLessThan(256);
  });
});

describe("formatResultCount", () => {
  it("groups thousands and picks the right noun", () => {
    expect(formatResultCount(1234, "movie")).toBe("1,234 movies");
    expect(formatResultCount(1, "movie")).toBe("1 movie");
    expect(formatResultCount(1, "tv")).toBe("1 TV show");
    expect(formatResultCount(0, "tv")).toBe("0 TV shows");
  });
});
