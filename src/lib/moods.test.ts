import { describe, expect, it } from "vitest";
import { MOODS, findMood } from "./moods";
import { MOVIE_SORT_OPTIONS, TV_SORT_OPTIONS } from "@/types/filters";

/**
 * The moods are a hand-written table that becomes a TMDB query and a landing
 * page, so the things that can go wrong with one are the things that go wrong
 * with hand-written tables: a slug that collides, a slug that does not survive a
 * URL, a sort key with a typo.
 *
 * The last is the quiet one. `sanitizeFilterOptions` keeps `sortBy` only when it
 * matches the sort options for that media type and drops it otherwise, without
 * complaint – so a mistyped sort does not error, it just silently returns the
 * default ordering and nobody finds out.
 */

const MOVIE_SORT_VALUES = new Set(MOVIE_SORT_OPTIONS.map((o) => o.value));
const TV_SORT_VALUES = new Set(TV_SORT_OPTIONS.map((o) => o.value));

describe("MOODS", () => {
  it("offers a real set of moods", () => {
    expect(MOODS.length).toBeGreaterThan(3);
  });

  it("gives every mood a distinct slug", () => {
    const slugs = MOODS.map((mood) => mood.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uses slugs that survive a URL unescaped", () => {
    // They are the address of a page – `/mood?slug=…` – and are compared back
    // against this table verbatim.
    for (const mood of MOODS) {
      expect(mood.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(encodeURIComponent(mood.slug)).toBe(mood.slug);
    }
  });

  it("gives every mood the copy its page and meta description need", () => {
    for (const mood of MOODS) {
      expect(mood.label.trim().length).toBeGreaterThan(0);
      expect(mood.emoji.trim().length).toBeGreaterThan(0);
      expect(mood.accent.trim().length).toBeGreaterThan(0);

      // The description is the meta description. Past ~160 characters a search
      // result shows the truncation rather than the tail.
      expect(mood.description.trim().length).toBeGreaterThan(20);
      expect(mood.description.length).toBeLessThanOrEqual(160);
    }
  });

  it("sorts by something the movie sanitiser will actually keep", () => {
    for (const mood of MOODS) {
      if (!mood.movie.sortBy) continue;
      expect(MOVIE_SORT_VALUES).toContain(mood.movie.sortBy);
    }
  });

  it("sorts by something the TV sanitiser will actually keep", () => {
    // Not the same list: `primary_release_date.desc` is a movie sort, and a TV
    // mood carrying one would quietly lose its ordering.
    for (const mood of MOODS) {
      if (!mood.tv?.sortBy) continue;
      expect(TV_SORT_VALUES).toContain(mood.tv.sortBy);
    }
  });

  it("writes genre and keyword ids in the shape TMDB parses", () => {
    for (const mood of MOODS) {
      for (const filters of [mood.movie, mood.tv]) {
        if (!filters) continue;

        // Comma is AND, pipe is OR; either way the parts are bare integers.
        if (filters.genre) expect(filters.genre).toMatch(/^\d+([,|]\d+)*$/);
        if (filters.withKeywords) {
          expect(filters.withKeywords).toMatch(/^\d+([,|]\d+)*$/);
        }
      }
    }
  });

  it("keeps every numeric bound inside the range it means something in", () => {
    for (const mood of MOODS) {
      for (const filters of [mood.movie, mood.tv]) {
        if (!filters) continue;

        if (filters.minRating !== undefined) {
          expect(filters.minRating).toBeGreaterThan(0);
          expect(filters.minRating).toBeLessThanOrEqual(10);
        }
        if (filters.voteCountGte !== undefined) {
          expect(filters.voteCountGte).toBeGreaterThan(0);
        }
        if (
          filters.withRuntimeGte !== undefined &&
          filters.withRuntimeLte !== undefined
        ) {
          // An inverted pair matches nothing and reads as an empty catalogue.
          expect(filters.withRuntimeGte).toBeLessThan(filters.withRuntimeLte);
        }
      }
    }
  });

  it("gives every mood something to actually query by", () => {
    for (const mood of MOODS) {
      const { genre, withKeywords, withRuntimeLte, withRuntimeGte } =
        mood.movie;

      expect(
        Boolean(genre || withKeywords || withRuntimeLte || withRuntimeGte),
      ).toBe(true);
    }
  });
});

describe("findMood", () => {
  it("finds a mood by its slug", () => {
    const first = MOODS[0];
    expect(findMood(first.slug)).toBe(first);
  });

  it("answers undefined for a slug that names nothing", () => {
    // The slug comes from the query string, so this is the ordinary case for a
    // hand-edited URL – the page renders its miss rather than throwing.
    expect(findMood("not-a-mood")).toBeUndefined();
    expect(findMood("")).toBeUndefined();
  });
});
