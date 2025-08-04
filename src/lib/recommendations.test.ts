import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Movie, TMDBResponse } from "@/types/tmdb";

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
const { tmdbDiscoverApi } = await import("./tmdb-discover");
const { getCachedMovieWatchProviders, getCachedTVWatchProviders } = await import("./tmdb-cache");
const { getSelectedProviderIds, getWatchProviderFilter } = await import("./settings");
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
  vi.mocked(tmdbDiscoverApi.discoverMovies).mockReset().mockResolvedValue({ results: [] } as never);
  vi.mocked(tmdbDiscoverApi.discoverTVShows).mockReset().mockResolvedValue({ results: [] } as never);
  vi.mocked(getCachedMovieWatchProviders).mockReset();
  vi.mocked(getCachedTVWatchProviders).mockReset();
  vi.mocked(getSelectedProviderIds).mockReturnValue([]);
  vi.mocked(getWatchProviderFilter).mockReturnValue("all");
});

describe("recommendation cancellation", () => {
  it("does not start any phase for an already cancelled load", async () => {
    const controller = new AbortController();
    const reason = new TypeError("Left the home page");
    controller.abort(reason);

    await expect(getRecommendationsFromWatchlist([seed(1)], [], controller.signal)).rejects.toBe(reason);
    expect(tmdbApi.getMovieRecommendations).not.toHaveBeenCalled();
    expect(getCachedMovieWatchProviders).not.toHaveBeenCalled();
    expect(tmdbDiscoverApi.discoverMovies).not.toHaveBeenCalled();
  });

  it("passes the same background consumer through movie and TV seeds, providers and top-ups", async () => {
    const controller = new AbortController();
    const options = { signal: controller.signal, priority: "background" };
    vi.mocked(getWatchProviderFilter).mockReturnValue("streaming-only");
    vi.mocked(getSelectedProviderIds).mockReturnValue([8]);
    vi.mocked(tmdbApi.getMovieRecommendations).mockResolvedValue({
      results: [{ ...recommended(10), genre_ids: [18] }],
    } as never);
    vi.mocked(tmdbApi.getTVShowRecommendations).mockResolvedValue({
      results: [{ ...recommended(20), name: "A Series", genre_ids: [35] }],
    } as never);
    vi.mocked(getCachedMovieWatchProviders).mockResolvedValue({ results: {} } as never);
    vi.mocked(getCachedTVWatchProviders).mockResolvedValue({ results: {} } as never);

    await getRecommendationsFromWatchlist([seed(1), { ...seed(2), mediaType: "tv" }], [], controller.signal);

    expect(tmdbApi.getMovieRecommendations).toHaveBeenCalledWith(1, options);
    expect(tmdbApi.getTVShowRecommendations).toHaveBeenCalledWith(2, options);
    expect(getCachedMovieWatchProviders).toHaveBeenCalledWith(10, "US", options);
    expect(getCachedTVWatchProviders).toHaveBeenCalledWith(20, "US", options);
    expect(tmdbDiscoverApi.discoverMovies).toHaveBeenCalledWith(1, expect.objectContaining({ genre: "18" }), options);
    expect(tmdbDiscoverApi.discoverTVShows).toHaveBeenCalledWith(1, expect.objectContaining({ genre: "35" }), options);
  });

  it("does not start provider reads when a late seed response finishes after cancellation", async () => {
    const controller = new AbortController();
    let finish!: (value: TMDBResponse<Movie>) => void;
    vi.mocked(tmdbApi.getMovieRecommendations).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    vi.mocked(getWatchProviderFilter).mockReturnValue("streaming-only");
    vi.mocked(getSelectedProviderIds).mockReturnValue([8]);
    const load = getRecommendationsFromWatchlist([seed(1)], [], controller.signal).catch((error: unknown) => error);

    const reason = new TypeError("Seed response no longer belongs to this page");
    controller.abort(reason);
    finish({ results: [recommended(10)] } as TMDBResponse<Movie>);

    expect(await load).toBe(reason);
    expect(getCachedMovieWatchProviders).not.toHaveBeenCalled();
    expect(tmdbDiscoverApi.discoverMovies).not.toHaveBeenCalled();
  });
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

  it("keeps the full saved history beyond the former two-thousand-item cap", () => {
    const seeds = Array.from({ length: 5000 }, (_, i) => seed(i + 1));

    expect(sanitizeSeeds(seeds)).toEqual(seeds);
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
      ...Array.from({ length: 2000 }, (_, i) => seed(i + 1)),
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

describe("recommendation load failures", () => {
  it.each([
    new Error("TMDB API error: 503 Unavailable"),
    new TypeError("Failed to fetch"),
  ])("surfaces a complete seed outage instead of an empty result: %s", async (failure) => {
    vi.mocked(tmdbApi.getMovieRecommendations).mockRejectedValue(failure);

    await expect(getRecommendationsFromWatchlist([seed(1), seed(2)]))
      .rejects.toBe(failure);
  });

  it("keeps a genuinely empty answer and removed seeds as an empty result", async () => {
    vi.mocked(tmdbApi.getMovieRecommendations).mockResolvedValue({ results: [] } as never);
    await expect(getRecommendationsFromWatchlist([seed(1)]))
      .resolves.toEqual({ items: [], basedOn: [] });

    vi.mocked(tmdbApi.getMovieRecommendations).mockRejectedValue(new Error("TMDB API error: 404 Not Found"));
    await expect(getRecommendationsFromWatchlist([seed(1)]))
      .resolves.toEqual({ items: [], basedOn: [] });
  });

  it.each([
    ["empty", []],
    ["already saved", [recommended(1)]],
  ] as const)("surfaces a failed seed beside %s recommendations", async (_description, results) => {
    const failure = new Error("TMDB API error: 503 Unavailable");
    vi.mocked(tmdbApi.getMovieRecommendations)
      .mockResolvedValueOnce({ results } as never)
      .mockRejectedValueOnce(failure);

    await expect(getRecommendationsFromWatchlist([seed(1), seed(2)]))
      .rejects.toBe(failure);
  });

  it("keeps an empty partial answer when the other seed was confirmed removed", async () => {
    vi.mocked(tmdbApi.getMovieRecommendations)
      .mockResolvedValueOnce({ results: [] } as never)
      .mockRejectedValueOnce(new Error("TMDB API error: 404 Not Found"));

    await expect(getRecommendationsFromWatchlist([seed(1), seed(2)]))
      .resolves.toEqual({ items: [], basedOn: [] });
  });

  it("keeps recommendations from a successful seed when another seed fails", async () => {
    vi.mocked(tmdbApi.getMovieRecommendations)
      .mockRejectedValueOnce(new Error("TMDB API error: 503 Unavailable"))
      .mockResolvedValueOnce({ results: [recommended(100)] } as never);

    const result = await getRecommendationsFromWatchlist([seed(1), seed(2)]);

    expect(result.items.map((item) => item.id)).toEqual([100]);
    expect(result.basedOn).toEqual(["Movie 2"]);
  });

  function useStreamingFilter() {
    vi.mocked(getWatchProviderFilter).mockReturnValue("streaming-only");
    vi.mocked(getSelectedProviderIds).mockReturnValue([8]);
    vi.mocked(tmdbApi.getMovieRecommendations).mockResolvedValue({
      results: [recommended(100), recommended(200)],
    } as never);
  }

  it("surfaces a complete availability outage when streaming picks cannot be checked", async () => {
    useStreamingFilter();
    const failure = new Error("TMDB API error: 503 Unavailable");
    vi.mocked(getCachedMovieWatchProviders).mockRejectedValue(failure);

    await expect(getRecommendationsFromWatchlist([seed(1)]))
      .rejects.toBe(failure);
  });

  it("keeps verified streaming picks when another provider lookup fails", async () => {
    useStreamingFilter();
    vi.mocked(getCachedMovieWatchProviders)
      .mockRejectedValueOnce(new Error("TMDB API error: 503 Unavailable"))
      .mockResolvedValueOnce({ results: { US: { flatrate: [{ provider_id: 8 }] } } } as never);

    const result = await getRecommendationsFromWatchlist([seed(1)]);

    expect(result.items.map((item) => item.id)).toEqual([200]);
  });

  it.each(["free", "ads"] as const)("keeps %s movie and TV picks on selected platforms without treating rentals as streaming", async (category) => {
    useStreamingFilter();
    vi.mocked(getSelectedProviderIds).mockReturnValue([300]);
    vi.mocked(tmdbApi.getMovieRecommendations).mockResolvedValue({
      results: [100, 101, 102, 103].map(recommended),
    } as never);
    vi.mocked(tmdbApi.getTVShowRecommendations).mockResolvedValue({
      results: [{ ...recommended(200), name: "A series" }],
    } as never);
    vi.mocked(getCachedMovieWatchProviders).mockImplementation(async (id) => ({
      results: id === 103
        ? { GB: { [category]: [{ provider_id: 300 }] } }
        : { US: id === 101
            ? { rent: [{ provider_id: 300 }] }
            : { [category]: [{ provider_id: id === 100 ? 300 : 207 }] } },
    }) as never);
    vi.mocked(getCachedTVWatchProviders).mockResolvedValue({
      results: { US: { [category]: [{ provider_id: 300 }] } },
    } as never);

    const result = await getRecommendationsFromWatchlist([
      seed(1), { id: 2, mediaType: "tv", title: "A saved series" },
    ]);

    expect(result.items.map((item) => [item.media_type, item.id])).toEqual([
      ["movie", 100], ["tv", 200],
    ]);
  });

  it.each([false, true])("surfaces a partial availability outage with no usable picks (genre top-up: %s)", async (withTopUp) => {
    useStreamingFilter();
    if (withTopUp) {
      vi.mocked(tmdbApi.getMovieRecommendations).mockResolvedValue({
        results: [100, 200].map((id) => ({ ...recommended(id), genre_ids: [18] })),
      } as never);
    }
    const failure = new TypeError("Failed to fetch");
    vi.mocked(getCachedMovieWatchProviders)
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ results: {} } as never);

    await expect(getRecommendationsFromWatchlist([seed(1)]))
      .rejects.toBe(failure);
  });

  it("surfaces a failed genre top-up when it is the only source of playable picks", async () => {
    useStreamingFilter();
    vi.mocked(tmdbApi.getMovieRecommendations).mockResolvedValue({
      results: [{ ...recommended(100), genre_ids: [18] }],
    } as never);
    vi.mocked(getCachedMovieWatchProviders).mockResolvedValue({ results: {} } as never);
    const failure = new Error("TMDB API error: 503 Unavailable");
    vi.mocked(tmdbDiscoverApi.discoverMovies).mockRejectedValue(failure);

    await expect(getRecommendationsFromWatchlist([seed(1)]))
      .rejects.toBe(failure);
  });

  it("surfaces a failed genre top-up when the other top-up contains only saved titles", async () => {
    useStreamingFilter();
    vi.mocked(tmdbApi.getMovieRecommendations).mockResolvedValue({
      results: [{ ...recommended(100), genre_ids: [18] }],
    } as never);
    vi.mocked(tmdbApi.getTVShowRecommendations).mockResolvedValue({
      results: [{ ...recommended(200), name: "A Series", genre_ids: [35] }],
    } as never);
    vi.mocked(getCachedMovieWatchProviders).mockResolvedValue({ results: {} } as never);
    vi.mocked(getCachedTVWatchProviders).mockResolvedValue({ results: {} } as never);
    vi.mocked(tmdbDiscoverApi.discoverMovies).mockResolvedValue({ results: [recommended(1)] } as never);
    const failure = new Error("TMDB API error: 503 Unavailable");
    vi.mocked(tmdbDiscoverApi.discoverTVShows).mockRejectedValue(failure);

    await expect(getRecommendationsFromWatchlist([
      seed(1), { id: 2, mediaType: "tv", title: "A saved series" },
    ])).rejects.toBe(failure);
  });

  it("keeps existing picks when an optional genre top-up fails", async () => {
    vi.mocked(tmdbApi.getMovieRecommendations).mockResolvedValue({
      results: [{ ...recommended(100), genre_ids: [18] }],
    } as never);
    vi.mocked(tmdbDiscoverApi.discoverMovies).mockRejectedValue(new Error("TMDB API error: 503 Unavailable"));

    const result = await getRecommendationsFromWatchlist([seed(1)]);

    expect(result.items.map((item) => item.id)).toEqual([100]);
  });
});
