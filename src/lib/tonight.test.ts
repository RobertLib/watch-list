import { describe, expect, it } from "vitest";
import {
  availableGenres,
  DEFAULT_FILTERS,
  filterCandidates,
  formatRuntime,
  matchesFilters,
  pickOne,
  reasonFor,
  type TonightCandidate,
  type TonightFilters,
} from "./tonight";

function candidate(
  overrides: Partial<TonightCandidate> = {},
): TonightCandidate {
  return {
    id: 550,
    mediaType: "movie",
    title: "Fight Club",
    posterPath: null,
    backdropPath: null,
    overview: null,
    slug: "fight-club-550",
    year: "1999",
    voteAverage: 8.4,
    runtime: 139,
    genres: ["Drama"],
    availability: "none",
    providers: [],
    ...overrides,
  };
}

const filters = (overrides: Partial<TonightFilters> = {}): TonightFilters => ({
  ...DEFAULT_FILTERS,
  ...overrides,
});

describe("matchesFilters", () => {
  it("accepts everything by default", () => {
    expect(matchesFilters(candidate(), filters())).toBe(true);
  });

  it("keeps only films when asked for a film", () => {
    expect(matchesFilters(candidate({ mediaType: "tv" }), filters({ type: "movie" })))
      .toBe(false);
  });

  it("rejects a long film when there is only an hour", () => {
    expect(matchesFilters(candidate({ runtime: 139 }), filters({ runtime: "short" })))
      .toBe(false);
  });

  it("accepts an episode-length runtime for the short band", () => {
    expect(
      matchesFilters(
        candidate({ mediaType: "tv", runtime: 45 }),
        filters({ runtime: "short" }),
      ),
    ).toBe(true);
  });

  it("treats the long band as a floor rather than a ceiling", () => {
    expect(matchesFilters(candidate({ runtime: 90 }), filters({ runtime: "long" })))
      .toBe(false);
    expect(matchesFilters(candidate({ runtime: 150 }), filters({ runtime: "long" })))
      .toBe(true);
  });

  it("lets an unknown runtime through rather than hiding it", () => {
    // TMDB not having a runtime is not evidence that the film is long.
    expect(matchesFilters(candidate({ runtime: null }), filters({ runtime: "short" })))
      .toBe(true);
  });

  it("honours the ready-to-play filter", () => {
    expect(
      matchesFilters(candidate({ availability: "streaming" }), filters({ readyOnly: true })),
    ).toBe(false);
    expect(
      matchesFilters(candidate({ availability: "mine" }), filters({ readyOnly: true })),
    ).toBe(true);
  });

  it("matches on genre", () => {
    expect(
      matchesFilters(candidate({ genres: ["Drama"] }), filters({ genre: "Comedy" })),
    ).toBe(false);
    expect(
      matchesFilters(
        candidate({ genres: ["Drama", "Comedy"] }),
        filters({ genre: "Comedy" }),
      ),
    ).toBe(true);
  });
});

describe("filterCandidates", () => {
  it("narrows the list to what fits", () => {
    const list = [
      candidate({ id: 1, runtime: 80 }),
      candidate({ id: 2, runtime: 200 }),
    ];

    expect(
      filterCandidates(list, filters({ runtime: "medium" })).map((c) => c.id),
    ).toEqual([1]);
  });
});

describe("pickOne", () => {
  it("has nothing to pick from an empty list", () => {
    expect(pickOne([], null)).toBeNull();
  });

  it("picks with the supplied randomness", () => {
    const list = [candidate({ id: 1 }), candidate({ id: 2 })];

    expect(pickOne(list, null, () => 0)?.id).toBe(1);
    expect(pickOne(list, null, () => 0.99)?.id).toBe(2);
  });

  it("avoids repeating the title already on screen", () => {
    const list = [candidate({ id: 1 }), candidate({ id: 2 })];

    expect(pickOne(list, "movie-1", () => 0)?.id).toBe(2);
  });

  it("repeats rather than returning nothing when it is the only option", () => {
    const list = [candidate({ id: 1 })];

    expect(pickOne(list, "movie-1", () => 0)?.id).toBe(1);
  });
});

describe("availableGenres", () => {
  it("collects every genre in the shortlist, sorted and deduplicated", () => {
    const list = [
      candidate({ id: 1, genres: ["Thriller", "Drama"] }),
      candidate({ id: 2, genres: ["Drama"] }),
    ];

    expect(availableGenres(list)).toEqual(["Drama", "Thriller"]);
  });
});

describe("formatRuntime", () => {
  it("reads a runtime the way people say it", () => {
    expect(formatRuntime(107)).toBe("1h 47m");
    expect(formatRuntime(120)).toBe("2h");
    expect(formatRuntime(45)).toBe("45m");
  });

  it("has nothing to say about a missing runtime", () => {
    expect(formatRuntime(null)).toBeNull();
    expect(formatRuntime(0)).toBeNull();
  });
});

describe("reasonFor", () => {
  it("names the platform when it is ready to play", () => {
    const reason = reasonFor(
      candidate({
        availability: "mine",
        providers: [{ id: 8, name: "Netflix", logoPath: null }],
      }),
      filters(),
    );

    expect(reason).toContain("on Netflix");
    expect(reason).toContain("2h 19m");
  });

  it("counts a series runtime per episode", () => {
    expect(
      reasonFor(candidate({ mediaType: "tv", runtime: 42 }), filters()),
    ).toContain("42m an episode");
  });
});
