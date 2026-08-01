import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  filterWatchlistItems,
  groupByAvailability,
  sanitizePreferences,
  sortWatchlistItems,
  type TitleAvailability,
  type WatchlistViewItem,
} from "./watchlist-view";

function item(
  overrides: Partial<WatchlistViewItem> & { id: number },
): WatchlistViewItem {
  return {
    title: `Film ${overrides.id}`,
    mediaType: "movie",
    posterPath: null,
    voteAverage: 7,
    releaseDate: "2020-01-01",
    savedAt: "2026-07-01T00:00:00.000Z",
    myRating: null,
    ...overrides,
  };
}

describe("sanitizePreferences", () => {
  it("keeps a valid set", () => {
    const prefs = {
      sort: "rating",
      type: "tv",
      grouping: "availability",
      ratedOnly: true,
    };

    expect(sanitizePreferences(prefs)).toEqual(prefs);
  });

  it("falls back per field rather than discarding the lot", () => {
    expect(
      sanitizePreferences({ sort: "sideways", type: "tv", grouping: 7 }),
    ).toEqual({
      sort: DEFAULT_PREFERENCES.sort,
      type: "tv",
      grouping: DEFAULT_PREFERENCES.grouping,
      ratedOnly: DEFAULT_PREFERENCES.ratedOnly,
    });
  });

  it("falls back entirely for anything unreadable", () => {
    expect(sanitizePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences("rating")).toEqual(DEFAULT_PREFERENCES);
  });
});

describe("filterWatchlistItems", () => {
  const items = [
    item({ id: 1, title: "Amélie", mediaType: "movie" }),
    item({ id: 2, title: "Breaking Bad", mediaType: "tv" }),
    item({ id: 3, title: "Blade Runner", mediaType: "movie" }),
  ];

  it("keeps everything by default", () => {
    expect(
      filterWatchlistItems(items, { type: "all", query: "" }),
    ).toHaveLength(3);
  });

  it("narrows to one media type", () => {
    expect(
      filterWatchlistItems(items, { type: "tv", query: "" }).map((i) => i.id),
    ).toEqual([2]);
  });

  it("matches a title case-insensitively", () => {
    expect(
      filterWatchlistItems(items, { type: "all", query: "blade" }).map(
        (i) => i.id,
      ),
    ).toEqual([3]);
  });

  it("matches across accents, so a plain keyboard still finds the title", () => {
    expect(
      filterWatchlistItems(items, { type: "all", query: "amelie" }).map(
        (i) => i.id,
      ),
    ).toEqual([1]);
  });

  it("ignores surrounding whitespace", () => {
    expect(
      filterWatchlistItems(items, { type: "all", query: "  bad  " }).map(
        (i) => i.id,
      ),
    ).toEqual([2]);
  });

  it("combines the two filters", () => {
    expect(
      filterWatchlistItems(items, { type: "movie", query: "b" }).map(
        (i) => i.id,
      ),
    ).toEqual([3]);
  });
});

describe("sortWatchlistItems", () => {
  const items = [
    item({ id: 1, title: "Bravo", voteAverage: 6, releaseDate: "2001-01-01", savedAt: "2026-07-02T00:00:00.000Z" }),
    item({ id: 2, title: "Alpha", voteAverage: 9, releaseDate: "2015-01-01", savedAt: "2026-07-01T00:00:00.000Z" }),
    item({ id: 3, title: "Charlie", voteAverage: 9, releaseDate: "", savedAt: "2026-07-03T00:00:00.000Z" }),
  ];

  it("puts the most recently saved first", () => {
    expect(sortWatchlistItems(items, "added").map((i) => i.id)).toEqual([
      3, 1, 2,
    ]);
  });

  it("sorts alphabetically", () => {
    expect(sortWatchlistItems(items, "title").map((i) => i.title)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ]);
  });

  it("sorts by rating, breaking ties by title", () => {
    // Alpha and Charlie both score 9, so the title decides and the order is
    // stable between renders.
    expect(sortWatchlistItems(items, "rating").map((i) => i.title)).toEqual([
      "Alpha",
      "Charlie",
      "Bravo",
    ]);
  });

  it("sorts by release date and puts an unknown date last", () => {
    expect(sortWatchlistItems(items, "release").map((i) => i.id)).toEqual([
      2, 1, 3,
    ]);
  });

  it("leaves the given array untouched", () => {
    const original = [...items];
    sortWatchlistItems(items, "title");

    expect(items).toEqual(original);
  });
});

describe("groupByAvailability", () => {
  const items = [
    item({ id: 1, title: "On Netflix" }),
    item({ id: 2, title: "On something else" }),
    item({ id: 3, title: "Rental only" }),
    item({ id: 4, title: "Nowhere" }),
    item({ id: 5, title: "Never checked" }),
  ];

  const byKey: Record<string, TitleAvailability> = {
    "movie-1": { status: "mine", providers: [] },
    "movie-2": { status: "streaming", providers: [] },
    "movie-3": { status: "rent", providers: [] },
    "movie-4": { status: "none", providers: [] },
  };

  it("orders the groups from most to least actionable", () => {
    const groups = groupByAvailability(items, byKey, {
      hasSelectedProviders: true,
      region: "CZ",
    });

    expect(groups.map((group) => group.id)).toEqual([
      "mine",
      "streaming",
      "rent",
      "none",
      "unknown",
    ]);
  });

  it("treats a title that was never looked up as unknown, not unavailable", () => {
    const groups = groupByAvailability(items, byKey, {
      hasSelectedProviders: true,
      region: "CZ",
    });
    const unknown = groups.find((group) => group.id === "unknown");

    expect(unknown?.items.map((i) => i.id)).toEqual([5]);
  });

  it("names the region in the unavailable heading", () => {
    const groups = groupByAvailability(items, byKey, {
      hasSelectedProviders: true,
      region: "CZ",
    });

    expect(groups.find((group) => group.id === "none")?.label).toBe(
      "Not streaming in CZ",
    );
  });

  it("changes the streaming heading when no platforms are chosen", () => {
    const withPlatforms = groupByAvailability(items, byKey, {
      hasSelectedProviders: true,
      region: "CZ",
    });
    const without = groupByAvailability(items, byKey, {
      hasSelectedProviders: false,
      region: "CZ",
    });

    expect(withPlatforms.find((g) => g.id === "streaming")?.label).toBe(
      "Streaming, but not on your platforms",
    );
    // With nothing chosen there is no "elsewhere" to contrast against.
    expect(without.find((g) => g.id === "streaming")?.label).toBe(
      "Streaming now",
    );
  });

  it("drops groups that hold nothing", () => {
    const groups = groupByAvailability([items[0]], byKey, {
      hasSelectedProviders: true,
      region: "CZ",
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe("mine");
  });

  it("puts everything under unknown before any lookup has come back", () => {
    const groups = groupByAvailability(items, {}, {
      hasSelectedProviders: false,
      region: "",
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe("unknown");
    expect(groups[0].items).toHaveLength(5);
  });

  it("keeps the order it was given inside each group", () => {
    const groups = groupByAvailability(
      [item({ id: 7, title: "Second" }), item({ id: 6, title: "First" })],
      {
        "movie-6": { status: "mine", providers: [] },
        "movie-7": { status: "mine", providers: [] },
      },
      { hasSelectedProviders: true, region: "CZ" },
    );

    // Grouping must not re-sort: the caller has already applied the chosen order.
    expect(groups[0].items.map((i) => i.id)).toEqual([7, 6]);
  });
});

describe("sorting by the viewer's own score", () => {
  const items = [
    item({ id: 1, title: "Alpha", myRating: 6 }),
    item({ id: 2, title: "Bravo", myRating: null }),
    item({ id: 3, title: "Charlie", myRating: 10 }),
    item({ id: 4, title: "Delta", myRating: 1 }),
  ];

  it("puts the highest score first", () => {
    expect(sortWatchlistItems(items, "my-rating").map((i) => i.title)).toEqual([
      "Charlie",
      "Alpha",
      "Delta",
      "Bravo",
    ]);
  });

  it("ranks a deliberate low score above never having judged it", () => {
    const sorted = sortWatchlistItems(items, "my-rating");
    const delta = sorted.findIndex((i) => i.title === "Delta");
    const bravo = sorted.findIndex((i) => i.title === "Bravo");

    expect(delta).toBeLessThan(bravo);
  });

  it("breaks ties by title", () => {
    expect(
      sortWatchlistItems(
        [item({ id: 5, title: "Zulu", myRating: 8 }), item({ id: 6, title: "Echo", myRating: 8 })],
        "my-rating",
      ).map((i) => i.title),
    ).toEqual(["Echo", "Zulu"]);
  });

  it("accepts the sort as a stored preference", () => {
    expect(sanitizePreferences({ sort: "my-rating" }).sort).toBe("my-rating");
  });
});

describe("the rated-only filter", () => {
  const items = [
    item({ id: 1, myRating: 9 }),
    item({ id: 2, myRating: null }),
    item({ id: 3, myRating: 1 }),
  ];

  it("keeps only what has a score", () => {
    expect(
      filterWatchlistItems(items, {
        type: "all",
        query: "",
        ratedOnly: true,
      }).map((entry) => entry.id),
    ).toEqual([1, 3]);
  });

  it("keeps a score of one, which is still a score", () => {
    expect(
      filterWatchlistItems([item({ id: 3, myRating: 1 })], {
        type: "all",
        query: "",
        ratedOnly: true,
      }),
    ).toHaveLength(1);
  });

  it("is off unless asked for", () => {
    expect(
      filterWatchlistItems(items, { type: "all", query: "" }),
    ).toHaveLength(3);
  });

  it("combines with the other filters rather than replacing them", () => {
    const mixed = [
      item({ id: 1, myRating: 8, mediaType: "movie" }),
      item({ id: 2, myRating: 8, mediaType: "tv" }),
    ];

    expect(
      filterWatchlistItems(mixed, {
        type: "tv",
        query: "",
        ratedOnly: true,
      }).map((entry) => entry.id),
    ).toEqual([2]);
  });

  it("reads a preference stored before the filter existed as off", () => {
    expect(
      sanitizePreferences({ sort: "added", type: "all", grouping: "none" })
        .ratedOnly,
    ).toBe(false);
  });
});
