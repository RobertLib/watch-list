import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MovieDetails, TVShowDetails } from "@/types/tmdb";
import type { WatchlistAvailability } from "./watchlist-availability";

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
const { sanitizeTonightRefs, getTonightCandidates } = await import(
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
  return { region: "US", hasSelectedProviders: false, byKey: {}, checked: 0 };
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

  /** Two cached reads per title, so the cap is what bounds a first, cold load. */
  it("caps the shortlist at 60 candidates", () => {
    const refs = Array.from({ length: 200 }, (_, i) => ({
      id: i + 1,
      mediaType: "tv",
    }));

    const sanitized = sanitizeTonightRefs(refs);

    expect(sanitized).toHaveLength(60);
    expect(sanitized[59]).toEqual({ id: 60, mediaType: "tv" });
  });
});

describe("getTonightCandidates", () => {
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
