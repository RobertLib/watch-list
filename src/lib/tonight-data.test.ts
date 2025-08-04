import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MovieDetails, TVShowDetails } from "@/types/tmdb";
import type { WatchlistAvailability } from "./watchlist-availability";
import { DEFAULT_FILTERS, filterCandidates, matchesFilters, pickOne } from "./tonight";

/**
 * The TMDB reads behind the "what tonight" shortlist.
 *
 * The scoring in `tonight.ts` is pure and tested on its own; what is left here
 * is the part that turns saved titles into the facts that scoring needs, and it
 * is where the failures actually live. A show whose runtime comes back null is
 * a card that cannot be filtered by "I have ninety minutes"; a title that lands
 * with the wrong availability is worse, because "not streaming in your region"
 * reads as a fact about the catalogue rather than as a defect here.
 */

vi.mock("./tmdb-cache", () => ({
  getCachedMovieDetails: vi.fn(),
  getCachedTVShowDetails: vi.fn(),
}));

vi.mock("./watchlist-availability", () => ({
  getWatchlistAvailability: vi.fn(),
}));

const { getCachedMovieDetails, getCachedTVShowDetails } = await import(
  "./tmdb-cache"
);
const { getWatchlistAvailability } = await import("./watchlist-availability");
const { sanitizeTonightRefs, getTonightCandidates, TonightCandidatesLoadError } = await import(
  "./tonight-data"
);

function movie(over: Partial<MovieDetails> = {}): MovieDetails {
  return {
    id: 550,
    title: "Fight Club",
    poster_path: "/poster.jpg",
    backdrop_path: "/backdrop.jpg",
    overview: "An insomniac office worker.",
    release_date: "1999-10-15",
    vote_average: 8.4,
    runtime: 139,
    genres: [{ id: 18, name: "Drama" }],
    ...over,
  } as MovieDetails;
}

function show(over: Partial<TVShowDetails> = {}): TVShowDetails {
  return {
    id: 1396,
    name: "Breaking Bad",
    poster_path: "/bb.jpg",
    backdrop_path: "/bb-wide.jpg",
    overview: "A chemistry teacher.",
    first_air_date: "2008-01-20",
    vote_average: 8.9,
    episode_run_time: [47],
    genres: [{ id: 18, name: "Drama" }],
    ...over,
  } as TVShowDetails;
}

/** No availability known for anything – the shape the resolver hands back. */
function noAvailability(): WatchlistAvailability {
  return { region: "US", hasSelectedProviders: false, byKey: {}, checked: 0, failedKeys: [] };
}

beforeEach(() => {
  vi.mocked(getCachedMovieDetails).mockReset();
  vi.mocked(getCachedTVShowDetails).mockReset();
  vi.mocked(getWatchlistAvailability).mockReset();
  vi.mocked(getWatchlistAvailability).mockResolvedValue(noAvailability());
});

describe("sanitizeTonightRefs", () => {
  it("keeps well-formed refs", () => {
    expect(
      sanitizeTonightRefs([
        { id: 550, mediaType: "movie" },
        { id: 1396, mediaType: "tv" },
      ]),
    ).toEqual([
      { id: 550, mediaType: "movie" },
      { id: 1396, mediaType: "tv" },
    ]);
  });

  it("answers an empty list for anything that is not an array", () => {
    expect(sanitizeTonightRefs(null)).toEqual([]);
    expect(sanitizeTonightRefs({ id: 550, mediaType: "movie" })).toEqual([]);
    expect(sanitizeTonightRefs("[]")).toEqual([]);
  });

  it("drops malformed entries rather than failing on them", () => {
    expect(
      sanitizeTonightRefs([
        null,
        42,
        { id: "550", mediaType: "movie" },
        { id: 0, mediaType: "movie" },
        { id: 2.5, mediaType: "movie" },
        { id: 7, mediaType: "person" },
        { id: 550, mediaType: "movie" },
      ]),
    ).toEqual([{ id: 550, mediaType: "movie" }]);
  });

  it("de-duplicates by id and type together", () => {
    expect(
      sanitizeTonightRefs([
        { id: 550, mediaType: "movie" },
        { id: 550, mediaType: "movie" },
        { id: 550, mediaType: "tv" },
      ]),
    ).toEqual([
      { id: 550, mediaType: "movie" },
      { id: 550, mediaType: "tv" },
    ]);
  });

  it("retains the full watchlist so older titles can satisfy the filters", () => {
    const refs = Array.from({ length: 200 }, (_, i) => ({
      id: i + 1,
      mediaType: "tv",
    }));

    const sanitized = sanitizeTonightRefs(refs);

    expect(sanitized).toEqual(refs);
  });
});

describe("getTonightCandidates", () => {
  describe("release eligibility", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 9, 6, 0, 1));
    });

    afterEach(() => vi.useRealTimers());

    it("cannot pick a film whose premiere is still in the future, even with providers", async () => {
      vi.mocked(getCachedMovieDetails).mockResolvedValue(movie({
        status: "Post Production", release_date: "2027-12-01",
      }));
      vi.mocked(getWatchlistAvailability).mockResolvedValue({
        ...noAvailability(),
        byKey: { "movie-550": { status: "mine", providers: [] } },
      });

      const candidates = await getTonightCandidates([{ id: 550, mediaType: "movie" }]);

      expect(pickOne(filterCandidates(candidates, DEFAULT_FILTERS), null)).toBeNull();
    });

    it.each(["Rumored", "Planned", "In Production", "Post Production", "Canceled"])(
      "excludes an undated %s film",
      async (status) => {
        vi.mocked(getCachedMovieDetails).mockResolvedValue(movie({ status, release_date: "" }));
        expect(await getTonightCandidates([{ id: 550, mediaType: "movie" }])).toEqual([]);
      },
    );

    it.each(["2026-10-06", "1999-10-15", ""])(
      "keeps a released film with premiere %s eligible on the visitor's local day",
      async (release_date) => {
        vi.mocked(getCachedMovieDetails).mockResolvedValue(movie({ status: "Released", release_date }));
        expect(await getTonightCandidates([{ id: 550, mediaType: "movie" }]))
          .toMatchObject([{ id: 550 }]);
      },
    );

    it("excludes future premieres even when the production status says Released", async () => {
      vi.mocked(getCachedMovieDetails).mockResolvedValue(movie({
        status: "Released", release_date: "2026-10-07",
      }));
      expect(await getTonightCandidates([{ id: 550, mediaType: "movie" }])).toEqual([]);
    });

    it.each([
      { status: "Returning Series", first_air_date: "2026-10-07" },
      { status: "Planned", first_air_date: "" },
      { status: "In Production", first_air_date: "" },
    ])("excludes a series that has not premiered: %j", async (overrides) => {
      vi.mocked(getCachedTVShowDetails).mockResolvedValue(show(overrides));
      expect(await getTonightCandidates([{ id: 1396, mediaType: "tv" }])).toEqual([]);
    });

    it.each(["Returning Series", "Canceled", "Ended"])(
      "keeps previously aired %s series, including shows still in production",
      async (status) => {
        vi.mocked(getCachedTVShowDetails).mockResolvedValue(show({ status, in_production: true }));
        expect(await getTonightCandidates([{ id: 1396, mediaType: "tv" }]))
          .toMatchObject([{ id: 1396 }]);
      },
    );
  });

  it("asks for nothing when the watchlist is empty", async () => {
    expect(await getTonightCandidates([])).toEqual([]);
    expect(getWatchlistAvailability).not.toHaveBeenCalled();
  });

  it("builds a candidate from a film's details", async () => {
    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie());

    const [candidate] = await getTonightCandidates([
      { id: 550, mediaType: "movie" },
    ]);

    expect(candidate).toEqual({
      id: 550,
      mediaType: "movie",
      title: "Fight Club",
      posterPath: "/poster.jpg",
      backdropPath: "/backdrop.jpg",
      overview: "An insomniac office worker.",
      slug: "fight-club-550",
      year: "1999",
      releaseDate: "1999-10-15",
      voteAverage: 8.4,
      runtime: 139,
      genres: ["Drama"],
      availability: "unknown",
      providers: [],
    });
  });

  it("uses a show's first episode runtime as the length of one sitting", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(
      show({ episode_run_time: [47, 60] }),
    );

    const [candidate] = await getTonightCandidates([
      { id: 1396, mediaType: "tv" },
    ]);

    expect(candidate.runtime).toBe(47);
    expect(candidate.year).toBe("2008");
    expect(candidate.releaseDate).toBe("2008-01-20");
  });

  it.each(["", undefined, "not-a-date", "1999-02-30"])("keeps an unknown movie release date (%s) unknown", async (releaseDate) => {
    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie({ release_date: releaseDate }));

    const [candidate] = await getTonightCandidates([{ id: 550, mediaType: "movie" }]);

    expect(candidate.releaseDate).toBeNull();
    expect(candidate.year).toBeNull();
  });

  it.each(["", null, undefined, "not-a-date", "2008-02-30"])("keeps an unknown TV first-air date (%s) unknown", async (releaseDate) => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show({ first_air_date: releaseDate }));

    const [candidate] = await getTonightCandidates([{ id: 1396, mediaType: "tv" }]);

    expect(candidate.releaseDate).toBeNull();
    expect(candidate.year).toBeNull();
  });

  it("reports an unknown runtime as null rather than as zero minutes", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(
      show({ episode_run_time: undefined }),
    );

    const [candidate] = await getTonightCandidates([
      { id: 1396, mediaType: "tv" },
    ]);

    expect(candidate.runtime).toBeNull();
  });

  it("keeps films with a zero runtime eligible for every length filter", async () => {
    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie({ runtime: 0 }));

    const [candidate] = await getTonightCandidates([{ id: 550, mediaType: "movie" }]);

    expect(candidate.runtime).toBeNull();
    for (const runtime of ["short", "medium", "long"] as const) {
      expect(matchesFilters(candidate, { ...DEFAULT_FILTERS, runtime })).toBe(true);
    }
  });

  /** One forgotten title should cost one card, not the whole shortlist. */
  it("drops a title that fails to load and keeps the others", async () => {
    vi.mocked(getCachedMovieDetails).mockImplementation(async (id: number) => {
      if (id === 404) throw new Error("TMDB API error: 404 Not Found");
      return movie({ id, title: `Film ${id}` });
    });

    const candidates = await getTonightCandidates([
      { id: 404, mediaType: "movie" },
      { id: 550, mediaType: "movie" },
    ]);

    expect(candidates.map((c) => c.id)).toEqual([550]);
  });

  it("surfaces an outage when every saved title fails", async () => {
    const outage = new Error("TMDB API error: 503 Service Unavailable");
    vi.mocked(getCachedMovieDetails).mockRejectedValue(outage);
    vi.mocked(getCachedTVShowDetails).mockRejectedValue(outage);

    await expect(getTonightCandidates([
      { id: 550, mediaType: "movie" },
      { id: 1396, mediaType: "tv" },
    ])).rejects.toBe(outage);
  });

  it("carries successful candidates and retryable refs when another title times out", async () => {
    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie());
    vi.mocked(getCachedTVShowDetails).mockRejectedValue(new TypeError("offline"));

    const failure = await getTonightCandidates([
      { id: 550, mediaType: "movie" },
      { id: 1396, mediaType: "tv" },
    ]).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(TonightCandidatesLoadError);
    expect(failure).toMatchObject({
      candidates: [expect.objectContaining({ id: 550, title: "Fight Club", runtime: 139 })],
      failedRefs: [{ id: 1396, mediaType: "tv" }],
    });
  });

  it("keeps removed titles out of retryable refs during a partial outage", async () => {
    vi.mocked(getCachedMovieDetails).mockImplementation(async (id) => {
      if (id === 404) throw new Error("TMDB API error: 404 Not Found");
      if (id === 503) throw new Error("TMDB API error: 503 Service Unavailable");
      return movie({ id });
    });

    await expect(getTonightCandidates([
      { id: 550, mediaType: "movie" },
      { id: 404, mediaType: "movie" },
      { id: 503, mediaType: "movie" },
    ])).rejects.toMatchObject({
      candidates: [expect.objectContaining({ id: 550 })],
      failedRefs: [{ id: 503, mediaType: "movie" }],
    });
  });

  it("offers the only playable saved title when it is beyond the former 60-title cap", async () => {
    const refs = Array.from({ length: 61 }, (_, index) => ({
      id: index + 1,
      mediaType: "movie" as const,
    }));
    vi.mocked(getCachedMovieDetails).mockImplementation(async (id) => movie({ id }));
    vi.mocked(getWatchlistAvailability).mockImplementation(async (batch) => ({
      ...noAvailability(),
      hasSelectedProviders: true,
      checked: batch.length,
      byKey: Object.fromEntries(batch.map((ref) => [
        `movie-${ref.id}`,
        { status: ref.id === 61 ? "mine" as const : "none" as const, providers: [] },
      ])),
    }));

    const candidates = await getTonightCandidates(sanitizeTonightRefs(refs));
    const matching = filterCandidates(candidates, { ...DEFAULT_FILTERS, readyOnly: true });

    expect(candidates).toHaveLength(61);
    expect(matching.map((candidate) => candidate.id)).toEqual([61]);
    expect(vi.mocked(getWatchlistAvailability).mock.calls.map(([batch]) => batch.length))
      .toEqual([60, 1]);
  });

  it("keeps a later successful batch when every lookup in the first batch fails", async () => {
    const refs = Array.from({ length: 61 }, (_, index) => ({
      id: index + 1,
      mediaType: "movie" as const,
    }));
    const outage = new Error("TMDB API error: 503 Service Unavailable");
    vi.mocked(getCachedMovieDetails).mockImplementation(async (id) => {
      if (id <= 60) throw outage;
      return movie({ id });
    });

    await expect(getTonightCandidates(refs)).rejects.toMatchObject({
      name: "TonightCandidatesLoadError",
      candidates: [expect.objectContaining({ id: 61 })],
      failedRefs: refs.slice(0, 60),
    });
    expect(getCachedMovieDetails).toHaveBeenCalledTimes(61);
  });

  it("preserves the original error when every batch suffers an outage", async () => {
    const refs = Array.from({ length: 61 }, (_, index) => ({
      id: index + 1,
      mediaType: "movie" as const,
    }));
    const outage = new Error("TMDB API error: 503 Service Unavailable");
    vi.mocked(getCachedMovieDetails).mockRejectedValue(outage);

    await expect(getTonightCandidates(refs)).rejects.toBe(outage);
    expect(getCachedMovieDetails).toHaveBeenCalledTimes(61);
  });

  it("forwards cancellation to movie, TV and availability lookups", async () => {
    const controller = new AbortController();
    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie());
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show());
    const refs = [{ id: 550, mediaType: "movie" as const }, { id: 1396, mediaType: "tv" as const }];

    await getTonightCandidates(refs, controller.signal);

    expect(getCachedMovieDetails).toHaveBeenCalledWith(550, undefined, {
      signal: controller.signal, priority: "background",
    });
    expect(getCachedTVShowDetails).toHaveBeenCalledWith(1396, {
      signal: controller.signal, priority: "background",
    });
    expect(getWatchlistAvailability).toHaveBeenCalledWith(refs, controller.signal);
  });

  it("stops an abandoned batch without starting the remaining titles", async () => {
    const controller = new AbortController();
    const refs = Array.from({ length: 61 }, (_, index) => ({
      id: index + 1,
      mediaType: "movie" as const,
    }));
    vi.mocked(getCachedMovieDetails).mockImplementation((id, _append, options) => {
      if (id !== 1) return Promise.resolve(movie({ id }));
      return new Promise((_resolve, reject) => {
        options!.signal!.addEventListener("abort", () => reject(options!.signal!.reason), { once: true });
      });
    });
    const load = getTonightCandidates(refs, controller.signal);
    const reason = new DOMException("Abandoned tonight picker", "AbortError");
    const cancelled = expect(load).rejects.toBe(reason);

    expect(getCachedMovieDetails).toHaveBeenCalledTimes(60);
    controller.abort(reason);

    await cancelled;
    expect(getCachedMovieDetails).toHaveBeenCalledTimes(60);
    expect(getWatchlistAvailability).toHaveBeenCalledTimes(1);
  });

  it("does not start lookups for an already cancelled load", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(getTonightCandidates([{ id: 550, mediaType: "movie" }], controller.signal))
      .rejects.toBe(controller.signal.reason);
    expect(getCachedMovieDetails).not.toHaveBeenCalled();
    expect(getWatchlistAvailability).not.toHaveBeenCalled();
  });

  it("returns no candidates when every title really has been removed", async () => {
    vi.mocked(getCachedMovieDetails).mockRejectedValue(
      new Error("TMDB API error: 404 Not Found"),
    );
    await expect(getTonightCandidates([{ id: 550, mediaType: "movie" }]))
      .resolves.toEqual([]);
  });

  it("carries the availability the resolver found onto the card", async () => {
    const netflix = { id: 8, name: "Netflix", logoPath: "/netflix.jpg" };
    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie());
    vi.mocked(getWatchlistAvailability).mockResolvedValue({
      ...noAvailability(),
      hasSelectedProviders: true,
      byKey: { "movie-550": { status: "mine", providers: [netflix] } },
      checked: 1,
    });

    const [candidate] = await getTonightCandidates([
      { id: 550, mediaType: "movie" },
    ]);

    expect(candidate.availability).toBe("mine");
    expect(candidate.providers).toEqual([netflix]);
  });

  it("falls back to a placeholder title rather than an empty card", async () => {
    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie({ title: "" }));
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show({ name: "" }));

    const candidates = await getTonightCandidates([
      { id: 550, mediaType: "movie" },
      { id: 1396, mediaType: "tv" },
    ]);

    expect(candidates.map((c) => c.title)).toEqual(["Film 550", "Series 1396"]);
  });
});
