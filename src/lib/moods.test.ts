import { describe, expect, it } from "vitest";
import {
  MOODS,
  MOOD_GROUPS,
  findMood,
  moodMediaNoun,
  moodsWithPlatforms,
} from "./moods";
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
      if (!mood.movie?.sortBy) continue;
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
    // A side with only a sort and a vote floor is every film on TMDB, best
    // first – a list, but not a mood.
    for (const mood of MOODS) {
      for (const filters of [mood.movie, mood.tv]) {
        if (!filters) continue;

        expect(
          Boolean(
            filters.genre ||
              filters.withKeywords ||
              filters.withRuntimeLte ||
              filters.withRuntimeGte ||
              filters.withOriginalLanguage ||
              filters.primaryReleaseDateGte ||
              filters.primaryReleaseDateLte ||
              filters.firstAirDateGte ||
              filters.firstAirDateLte ||
              filters.voteCountLte,
          ),
          mood.slug,
        ).toBe(true);
      }
    }
  });

  // `loadMoodPicks` asks only for the halves a mood has; one with neither
  // would be a page with a heading and nothing under it.
  it("gives every mood films, series or both", () => {
    for (const mood of MOODS) {
      expect(Boolean(mood.movie || mood.tv), mood.slug).toBe(true);
    }
  });

  it("gives every mood a heading that says what is on the page", () => {
    for (const mood of MOODS) {
      expect(mood.title.trim().length, mood.slug).toBeGreaterThan(8);
      // The `<title>` is this plus " | WatchList", and " on Amazon Prime Video"
      // on a landing; past ~60 characters a search result cuts it.
      expect(mood.title.length, mood.slug).toBeLessThanOrEqual(50);
    }
    const titles = MOODS.map((mood) => mood.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("files every mood under a section the index page shows", () => {
    const groups = new Set<string>(MOOD_GROUPS.map((group) => group.id));
    for (const mood of MOODS) {
      expect(groups, mood.slug).toContain(mood.group);
    }
    // And no section is a heading over nothing.
    for (const group of MOOD_GROUPS) {
      expect(MOODS.some((mood) => mood.group === group.id), group.id).toBe(true);
    }
  });

  it("puts a date bound only on the side that reads it", () => {
    // `buildFilteredUrl` sends the release pair to films and the air-date pair
    // to series, and silently drops the other – a decade written with the
    // wrong pair is a list of every decade.
    for (const mood of MOODS) {
      expect(mood.movie?.firstAirDateGte ?? mood.movie?.firstAirDateLte, mood.slug).toBeUndefined();
      expect(mood.tv?.primaryReleaseDateGte ?? mood.tv?.primaryReleaseDateLte, mood.slug).toBeUndefined();

      for (const [from, to] of [
        [mood.movie?.primaryReleaseDateGte, mood.movie?.primaryReleaseDateLte],
        [mood.tv?.firstAirDateGte, mood.tv?.firstAirDateLte],
      ]) {
        for (const date of [from, to]) {
          if (date) expect(date, mood.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
        if (from && to) expect(from < to, mood.slug).toBe(true);
      }
    }
  });

  it("keeps a vote ceiling above its floor", () => {
    for (const mood of MOODS) {
      for (const filters of [mood.movie, mood.tv]) {
        if (filters?.voteCountLte === undefined) continue;
        expect(filters.voteCountLte, mood.slug).toBeGreaterThan(filters.voteCountGte ?? 0);
      }
    }
  });
});

describe("moodsWithPlatforms", () => {
  // Seven platforms each: every mood added here is seven more pages, most of
  // them thin for a narrow mood. A handful, chosen – not the table.
  it("is a chosen few, not every mood", () => {
    const withPlatforms = moodsWithPlatforms();
    expect(withPlatforms.length).toBeGreaterThan(0);
    expect(withPlatforms.length).toBeLessThanOrEqual(15);
    expect(withPlatforms.every((mood) => mood.platforms)).toBe(true);
  });
});

describe("moodMediaNoun", () => {
  it("names what a mood's page lists", () => {
    expect(moodMediaNoun(findMood("easy-watch")!)).toBe("Movies & TV Shows");
    expect(moodMediaNoun(findMood("mind-bending")!)).toBe("Movies");
    expect(moodMediaNoun(findMood("limited-series")!)).toBe("TV Shows");
  });
});

/**
 * TMDB reads a comma in `with_genres` as AND and a pipe as OR. Three moods used
 * a comma, or a single genre, where the comment above them listed genres the
 * mood was about – asking TMDB for far less than the page described.
 */
describe("genre queries", () => {
  const genreOf = (slug: string, side: "movie" | "tv") =>
    findMood(slug)?.[side]?.genre;

  it("asks for any of the genres a mood is about", () => {
    expect(genreOf("easy-watch", "movie")).toBe("35|10751|10749");
    expect(genreOf("easy-watch", "tv")).toBe("35|10751");
    expect(genreOf("edge-of-your-seat", "movie")).toBe("53|9648");
  });

  it("keeps the intersection only where it is the point", () => {
    expect(genreOf("big-and-loud", "movie")).toBe("28,12");
  });

  it("never mixes AND and OR in one expression, which TMDB gives no precedence for", () => {
    for (const mood of MOODS) {
      for (const filters of [mood.movie, mood.tv]) {
        const genre = filters?.genre ?? "";
        expect(genre.includes(",") && genre.includes("|")).toBe(false);
      }
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
