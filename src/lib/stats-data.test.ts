import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MovieDetails, TVShowDetails } from "@/types/tmdb";
import { summarize } from "./stats";

/**
 * The TMDB reads behind the stats page.
 *
 * Two things here are worth pinning down. The sanitiser, because its input is
 * the visitor's own watched list – hand-editable storage that outlives the shape
 * that wrote it. Stats must keep the whole history, while a small title
 * selection can retain a cap and detail requests are queued in batches.
 *
 * And the partial failure. Every detail read is settled rather than awaited
 * together, so one title TMDB has forgotten drops out of the map instead of
 * rejecting the whole load. `stats.ts` reads an absent key as "runtime unknown";
 * a zero would be counted, and the year in review would quietly understate
 * itself rather than admit it is missing something.
 */

vi.mock("./tmdb-cache", () => ({
  getCachedMovieDetails: vi.fn(),
  getCachedTVShowDetails: vi.fn(),
}));

const { getCachedMovieDetails, getCachedTVShowDetails } = await import(
  "./tmdb-cache"
);
const { sanitizeFactRefs, getTitleFacts, TitleFactsLoadError } = await import("./stats-data");

function movie(over: Partial<MovieDetails> = {}): MovieDetails {
  return {
    id: 1,
    title: "A Film",
    runtime: 100,
    genres: [{ id: 18, name: "Drama" }],
    release_date: "1999-03-31",
    ...over,
  } as MovieDetails;
}

function show(over: Partial<TVShowDetails> = {}): TVShowDetails {
  return {
    id: 2,
    name: "A Series",
    episode_run_time: [42],
    genres: [{ id: 10765, name: "Sci-Fi" }],
    first_air_date: "2008-01-20",
    ...over,
  } as TVShowDetails;
}

beforeEach(() => {
  vi.mocked(getCachedMovieDetails).mockReset();
  vi.mocked(getCachedTVShowDetails).mockReset();
});

describe("sanitizeFactRefs", () => {
  it("keeps well-formed refs", () => {
    expect(
      sanitizeFactRefs([
        { id: 550, mediaType: "movie" },
        { id: 1396, mediaType: "tv" },
      ]),
    ).toEqual([
      { id: 550, mediaType: "movie" },
      { id: 1396, mediaType: "tv" },
    ]);
  });

  it("answers an empty list for anything that is not an array", () => {
    expect(sanitizeFactRefs(null)).toEqual([]);
    expect(sanitizeFactRefs(undefined)).toEqual([]);
    expect(sanitizeFactRefs("550")).toEqual([]);
    expect(sanitizeFactRefs({ id: 550, mediaType: "movie" })).toEqual([]);
  });

  it("drops entries that are not objects", () => {
    expect(
      sanitizeFactRefs([null, 7, "movie", { id: 550, mediaType: "movie" }]),
    ).toEqual([{ id: 550, mediaType: "movie" }]);
  });

  it("drops ids that are not positive integers", () => {
    expect(
      sanitizeFactRefs([
        { id: "550", mediaType: "movie" },
        { id: 1.5, mediaType: "movie" },
        { id: 0, mediaType: "movie" },
        { id: -1, mediaType: "movie" },
        { id: NaN, mediaType: "movie" },
        { id: 550, mediaType: "movie" },
      ]),
    ).toEqual([{ id: 550, mediaType: "movie" }]);
  });

  it("drops anything that is not a movie or a show", () => {
    expect(
      sanitizeFactRefs([
        { id: 1, mediaType: "person" },
        { id: 2, mediaType: "" },
        { id: 3 },
        { id: 4, mediaType: "tv" },
      ]),
    ).toEqual([{ id: 4, mediaType: "tv" }]);
  });

  /** The same id under two media types is two different titles. */
  it("de-duplicates by id and type together", () => {
    expect(
      sanitizeFactRefs([
        { id: 550, mediaType: "movie" },
        { id: 550, mediaType: "movie" },
        { id: 550, mediaType: "tv" },
      ]),
    ).toEqual([
      { id: 550, mediaType: "movie" },
      { id: 550, mediaType: "tv" },
    ]);
  });

  it("caps the list at 200, which is what bounds the upstream reads", () => {
    const refs = Array.from({ length: 500 }, (_, i) => ({
      id: i + 1,
      mediaType: "movie",
    }));

    const sanitized = sanitizeFactRefs(refs);

    expect(sanitized).toHaveLength(200);
    // Oldest-first: the cap truncates rather than samples.
    expect(sanitized[0]).toEqual({ id: 1, mediaType: "movie" });
    expect(sanitized[199]).toEqual({ id: 200, mediaType: "movie" });
  });

  it("keeps the whole watching history when the caller needs complete totals", () => {
    const refs = Array.from({ length: 501 }, (_, i) => ({
      id: i + 1,
      mediaType: "movie",
    }));

    expect(sanitizeFactRefs(refs, Number.POSITIVE_INFINITY)).toEqual(refs);
  });
});

describe("getTitleFacts", () => {
  it("counts runtimes and genres beyond the first 200 films", async () => {
    vi.mocked(getCachedMovieDetails).mockImplementation(async (id: number) =>
      movie({
        id,
        runtime: 120,
        genres: [{ id: id === 201 ? 35 : 18, name: id === 201 ? "Comedy" : "Drama" }],
      }),
    );
    const watched = Array.from({ length: 201 }, (_, i) => ({
      id: i + 1,
      mediaType: "movie" as const,
      title: `Film ${i + 1}`,
      posterPath: null,
      watchedAt: "2026-10-01T10:00:00.000Z",
    }));

    const facts = await getTitleFacts(sanitizeFactRefs(watched, Number.POSITIVE_INFINITY));
    const totals = summarize({ watched, episodesByShow: {}, ratings: {}, facts });

    expect(totals.minutes).toBe(402 * 60);
    expect(totals.titlesWithoutRuntime).toBe(0);
    expect(totals.topGenres).toContainEqual({ name: "Comedy", count: 1 });
    expect(getCachedMovieDetails).toHaveBeenCalledTimes(201);
  });

  it("queues a bounded batch before advancing through a long history", async () => {
    let finishBatch!: () => void;
    const pending = new Promise<void>((resolve) => { finishBatch = resolve; });
    vi.mocked(getCachedMovieDetails).mockImplementation(async (id: number) => {
      await pending;
      return movie({ id });
    });
    const refs = Array.from({ length: 401 }, (_, i) => ({
      id: i + 1,
      mediaType: "movie" as const,
    }));

    const result = getTitleFacts(refs);
    expect(getCachedMovieDetails).toHaveBeenCalledTimes(200);
    finishBatch();

    expect(Object.keys(await result)).toHaveLength(401);
    expect(getCachedMovieDetails).toHaveBeenCalledTimes(401);
  });

  it("passes cancellation and background priority through movie and TV lookups", async () => {
    const controller = new AbortController();
    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie());
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show());
    await getTitleFacts([
      { id: 1, mediaType: "movie" },
      { id: 2, mediaType: "tv" },
    ], controller.signal);
    const options = { signal: controller.signal, priority: "background" };
    expect(getCachedMovieDetails).toHaveBeenCalledWith(1, undefined, options);
    expect(getCachedTVShowDetails).toHaveBeenCalledWith(2, options);
  });

  it("stops before scheduling another batch when the caller leaves", async () => {
    const controller = new AbortController();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    vi.mocked(getCachedMovieDetails).mockImplementation(async (id: number) => {
      await pending;
      return movie({ id });
    });
    const result = getTitleFacts(Array.from({ length: 401 }, (_, index) => ({
      id: index + 1, mediaType: "movie" as const,
    })), controller.signal);
    expect(getCachedMovieDetails).toHaveBeenCalledTimes(200);
    controller.abort();
    finish();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(getCachedMovieDetails).toHaveBeenCalledTimes(200);
  });

  it("does not schedule a history whose caller already left", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(getTitleFacts([{ id: 1, mediaType: "movie" }], controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(getCachedMovieDetails).not.toHaveBeenCalled();
  });

  it("asks for nothing when there is nothing to ask about", async () => {
    expect(await getTitleFacts([])).toEqual({});
    expect(getCachedMovieDetails).not.toHaveBeenCalled();
    expect(getCachedTVShowDetails).not.toHaveBeenCalled();
  });

  it("keys facts by id and media type", async () => {
    vi.mocked(getCachedMovieDetails).mockResolvedValue(movie({ id: 550 }));
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show({ id: 1396 }));

    const facts = await getTitleFacts([
      { id: 550, mediaType: "movie" },
      { id: 1396, mediaType: "tv" },
    ]);

    expect(facts["movie-550"]).toEqual({
      id: 550,
      mediaType: "movie",
      runtime: 100,
      genres: ["Drama"],
      year: "1999",
    });
    expect(facts["tv-1396"]).toEqual({
      id: 1396,
      mediaType: "tv",
      runtime: 42,
      genres: ["Sci-Fi"],
      year: "2008",
    });
  });

  /** The reason every read is settled rather than awaited together. */
  it("leaves out a title TMDB no longer knows and keeps the rest", async () => {
    vi.mocked(getCachedMovieDetails).mockImplementation(async (id: number) => {
      if (id === 404) throw new Error("TMDB API error: 404 Not Found");
      return movie({ id });
    });

    const facts = await getTitleFacts([
      { id: 404, mediaType: "movie" },
      { id: 550, mediaType: "movie" },
    ]);

    expect(facts["movie-404"]).toBeUndefined();
    expect(facts["movie-550"]).toBeDefined();
  });

  it("reports temporary failures alongside every available batch of facts", async () => {
    vi.mocked(getCachedMovieDetails).mockImplementation(async (id: number) => {
      if (id === 1 || id === 201) throw new Error("TMDB API error: 503 Unavailable");
      return movie({ id });
    });
    vi.mocked(getCachedTVShowDetails).mockRejectedValue(new Error("Offline"));
    const refs = [
      ...Array.from({ length: 201 }, (_, index) => ({
        id: index + 1,
        mediaType: "movie" as const,
      })),
      { id: 2, mediaType: "tv" as const },
    ];

    const error = await getTitleFacts(refs).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(TitleFactsLoadError);
    const failure = error as InstanceType<typeof TitleFactsLoadError>;
    expect(failure.failedKeys).toEqual(["movie-1", "movie-201", "tv-2"]);
    expect(Object.keys(failure.facts)).toHaveLength(199);
    expect(failure.facts["movie-200"]).toBeDefined();
    expect(getCachedMovieDetails).toHaveBeenCalledTimes(201);
  });

  it("distinguishes a complete outage from an empty history", async () => {
    vi.mocked(getCachedMovieDetails).mockRejectedValue(new Error("Offline"));

    await expect(getTitleFacts([{ id: 550, mediaType: "movie" }]))
      .rejects.toMatchObject({ facts: {}, failedKeys: ["movie-550"] });
    await expect(getTitleFacts([])).resolves.toEqual({});
  });

  it.each([0, -1, NaN, Infinity])(
    "excludes an invalid movie runtime (%s) and reports incomplete watch time",
    async (runtime) => {
      vi.mocked(getCachedMovieDetails).mockImplementation(async (id: number) =>
        movie({ id, runtime: id === 1 ? runtime : 100 }),
      );
      const watched = [1, 2].map((id) => ({
        id,
        mediaType: "movie" as const,
        title: `Film ${id}`,
        posterPath: null,
        watchedAt: "2026-10-01T10:00:00.000Z",
      }));

      const facts = await getTitleFacts(sanitizeFactRefs(watched));
      const totals = summarize({ watched, episodesByShow: {}, ratings: {}, facts });

      expect(totals.minutes).toBe(100);
      expect(totals.titlesWithoutRuntime).toBe(1);
      expect(totals.totalTitles).toBe(2);
    },
  );

  it("reports an unknown runtime as null rather than as zero", async () => {
    vi.mocked(getCachedMovieDetails).mockResolvedValue(
      movie({ runtime: undefined }),
    );
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(
      show({ episode_run_time: [] }),
    );

    const facts = await getTitleFacts([
      { id: 1, mediaType: "movie" },
      { id: 2, mediaType: "tv" },
    ]);

    expect(facts["movie-1"].runtime).toBeNull();
    expect(facts["tv-2"].runtime).toBeNull();
  });

  /**
   * A list of runtimes is TMDB's way of saying the format changed. The first is
   * the usual one, and the usual one is what an hours-watched total wants.
   */
  it("takes the first of several episode runtimes", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(
      show({ episode_run_time: [42, 60, 90] }),
    );

    const facts = await getTitleFacts([{ id: 2, mediaType: "tv" }]);

    expect(facts["tv-2"].runtime).toBe(42);
  });

  it("reports a missing date as a null year rather than an empty string", async () => {
    vi.mocked(getCachedMovieDetails).mockResolvedValue(
      movie({ release_date: "" }),
    );

    const facts = await getTitleFacts([{ id: 1, mediaType: "movie" }]);

    expect(facts["movie-1"].year).toBeNull();
  });

  it("survives a title with no genres listed", async () => {
    vi.mocked(getCachedMovieDetails).mockResolvedValue(
      movie({ genres: undefined }),
    );

    const facts = await getTitleFacts([{ id: 1, mediaType: "movie" }]);

    expect(facts["movie-1"].genres).toEqual([]);
  });
});
