import { describe, expect, it } from "vitest";
import { sanitizeSeeds } from "./recommendations";

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

  it("caps how many entries a single payload can carry", () => {
    const seeds = Array.from({ length: 500 }, (_, i) => ({
      id: i + 1,
      mediaType: "movie" as const,
      title: `Movie ${i + 1}`,
    }));

    expect(sanitizeSeeds(seeds)).toHaveLength(100);
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
