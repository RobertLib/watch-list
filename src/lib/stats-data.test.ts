import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MovieDetails, TVShowDetails } from "@/types/tmdb";

/**
 * The TMDB reads behind the stats page.
 *
 * Two things here are worth pinning down. The sanitiser, because its input is
 * the visitor's own watched list – hand-editable storage that outlives the shape
 * that wrote it – and its cap is the only thing standing between a thousand-title
 * history and a thousand upstream reads per page view.
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
const { sanitizeFactRefs, getTitleFacts } = await import("./stats-data");

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
});

describe("getTitleFacts", () => {
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
