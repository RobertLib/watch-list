import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Movie } from "@/types/tmdb";

vi.mock("./tmdb", () => ({
  tmdbApi: {
    getMovieRecommendations: vi.fn(),
    getTVShowRecommendations: vi.fn(),
  },
}));

vi.mock("./tmdb-discover", () => ({
  tmdbDiscoverApi: {
    discoverMovies: vi.fn(async () => ({ results: [] })),
    discoverTVShows: vi.fn(async () => ({ results: [] })),
  },
}));

vi.mock("./tmdb-cache", () => ({
  getCachedMovieWatchProviders: vi.fn(),
  getCachedTVWatchProviders: vi.fn(),
}));

vi.mock("./settings", () => ({
  getRegion: vi.fn(() => "US"),
  getSelectedProviderIds: vi.fn(() => []),
  getWatchProviderFilter: vi.fn(() => "all"),
}));

const { tmdbApi } = await import("./tmdb");
const { getRecommendationsFromWatchlist, sanitizeSeeds } = await import(
  "./recommendations"
);

/** A TMDB recommendation row with enough on it to survive the filters. */
function recommended(id: number): Movie {
  return {
    id,
    title: `Movie ${id}`,
    poster_path: `/poster-${id}.jpg`,
    vote_average: 7,
    vote_count: 500,
    genre_ids: [],
    adult: false,
  } as unknown as Movie;
}

function seed(id: number) {
  return { id, mediaType: "movie" as const, title: `Movie ${id}` };
}

beforeEach(() => {
  vi.mocked(tmdbApi.getMovieRecommendations).mockReset();
  vi.mocked(tmdbApi.getTVShowRecommendations).mockReset();
});

describe("sanitizeSeeds", () => {
  it("keeps well-formed entries", () => {
    expect(
      sanitizeSeeds([
        { id: 155, mediaType: "movie", title: "The Dark Knight" },
        { id: 1396, mediaType: "tv", title: "Breaking Bad" },
      ]),
    ).toEqual([
      { id: 155, mediaType: "movie", title: "The Dark Knight" },
      { id: 1396, mediaType: "tv", title: "Breaking Bad" },
    ]);
  });

  it("rejects a payload that is not an array", () => {
    expect(sanitizeSeeds(undefined)).toEqual([]);
    expect(sanitizeSeeds(null)).toEqual([]);
    expect(sanitizeSeeds("[]")).toEqual([]);
    expect(sanitizeSeeds({ id: 155, mediaType: "movie" })).toEqual([]);
  });

  it("drops entries without a usable id", () => {
    expect(
      sanitizeSeeds([
        { id: 0, mediaType: "movie" },
        { id: -1, mediaType: "movie" },
        { id: 1.5, mediaType: "movie" },
        { id: "155", mediaType: "movie" },
        { id: NaN, mediaType: "movie" },
        { mediaType: "movie" },
      ]),
    ).toEqual([]);
  });

  it("drops entries whose media type is not one TMDB has an endpoint for", () => {
    expect(
      sanitizeSeeds([
        { id: 155, mediaType: "person" },
        { id: 156, mediaType: "" },
        { id: 157 },
        { id: 158, mediaType: "movie" },
      ]),
    ).toEqual([{ id: 158, mediaType: "movie", title: "" }]);
  });

  it("skips entries that are not objects at all", () => {
    expect(sanitizeSeeds([null, undefined, 155, "movie", []])).toEqual([]);
  });

  // The same title can sit on the watchlist twice after a storage merge, and a
  // duplicate seed would double-count that taste in the ranking.
  it("de-duplicates on id and media type together", () => {
    expect(
      sanitizeSeeds([
        { id: 155, mediaType: "movie", title: "first" },
        { id: 155, mediaType: "movie", title: "again" },
        { id: 155, mediaType: "tv", title: "different type" },
      ]),
    ).toEqual([
      { id: 155, mediaType: "movie", title: "first" },
      { id: 155, mediaType: "tv", title: "different type" },
    ]);
  });

  it("replaces a non-string title with an empty one rather than dropping the seed", () => {
    expect(sanitizeSeeds([{ id: 155, mediaType: "movie", title: 42 }])).toEqual([
      { id: 155, mediaType: "movie", title: "" },
    ]);
  });

  it("truncates a title long enough to be an attack on the response size", () => {
    const [seed] = sanitizeSeeds([
      { id: 155, mediaType: "movie", title: "x".repeat(10_000) },
    ]);
    expect(seed.title).toHaveLength(200);
  });

  // Bounded at what the stores hold, not below it: an entry past the bound is a
  // saved title the recommender does not know about, and so one it can hand
  // straight back.
  it("keeps every entry the stores can hold", () => {
    const seeds = Array.from({ length: 2000 }, (_, i) => seed(i + 1));

    expect(sanitizeSeeds(seeds)).toHaveLength(2000);
  });

  it("caps a payload past what any store would hold", () => {
    const seeds = Array.from({ length: 5000 }, (_, i) => seed(i + 1));

    expect(sanitizeSeeds(seeds)).toHaveLength(2000);
  });
});

describe("getRecommendationsFromWatchlist and the exclusion set", () => {
  /**
   * The regression. The lists used to be cut at a hundred entries before the
   * exclusion set was built from them, so anything someone had watched past
   * that point – the whole back half of a real viewing history – was fair game
   * to recommend back to them.
   */
  it("never recommends a title from deep in the watched list", async () => {
    // The first seed's recommendations name two films: one the visitor watched
    // long ago (deep in the list), one they have never seen.
    vi.mocked(tmdbApi.getMovieRecommendations).mockImplementation(
      async (id: number) =>
        ({
          results: id === 1 ? [recommended(9_999), recommended(8_888)] : [],
        }) as never,
    );

    const watched = [
      ...Array.from({ length: 150 }, (_, i) => seed(i + 1)),
      seed(9_999),
    ];

    const { items } = await getRecommendationsFromWatchlist([], watched);

    expect(items.map((item) => item.id)).toEqual([8_888]);
  });

  it("only spends requests on the leading seeds", async () => {
    vi.mocked(tmdbApi.getMovieRecommendations).mockResolvedValue({
      results: [],
    } as never);

    const watchlist = Array.from({ length: 40 }, (_, i) => seed(i + 1));
    await getRecommendationsFromWatchlist(watchlist);

    expect(tmdbApi.getMovieRecommendations).toHaveBeenCalledTimes(6);
  });
});

describe("sanitizeSeeds and the viewer's own score", () => {
  it("keeps a score it can use", () => {
    expect(
      sanitizeSeeds([{ id: 550, mediaType: "movie", title: "Fight Club", rating: 9 }]),
    ).toEqual([{ id: 550, mediaType: "movie", title: "Fight Club", rating: 9 }]);
  });

  it("omits the field entirely when there is no opinion on record", () => {
    const [seed] = sanitizeSeeds([{ id: 550, mediaType: "movie" }]);

    // Absent rather than null, so the recommender can tell "unrated" from a score
    // it should weigh.
    expect(seed).not.toHaveProperty("rating");
  });

  it("discards a score it could not have written", () => {
    for (const rating of [0, 11, 7.5, "9", null, NaN]) {
      const [seed] = sanitizeSeeds([{ id: 550, mediaType: "movie", rating }]);
      expect(seed).not.toHaveProperty("rating");
    }
  });

  it("keeps the lowest and highest scores a viewer can give", () => {
    expect(
      sanitizeSeeds([
        { id: 1, mediaType: "movie", rating: 1 },
        { id: 2, mediaType: "movie", rating: 10 },
      ]).map((seed) => seed.rating),
    ).toEqual([1, 10]);
  });
});
