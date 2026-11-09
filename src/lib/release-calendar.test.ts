import { describe, expect, it } from "vitest";
import {
  groupCalendarEvents,
  isDateOnly,
  sanitizeCalendarSeeds,
  selectCalendarCandidates,
  type CalendarEvent,
  type CalendarSeed,
} from "./release-calendar";
// Used here only to build fixtures; its own tests live beside it in dates.test.ts.
import { shiftDate } from "./dates";

const TODAY = "2026-08-01";

function movieSeed(overrides: Partial<CalendarSeed> = {}): CalendarSeed {
  return {
    id: 550,
    mediaType: "movie",
    title: "Fight Club",
    posterPath: null,
    releaseDate: "1999-10-15",
    ...overrides,
  };
}

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    key: "movie-550",
    id: 550,
    mediaType: "movie",
    slug: "fight-club-550",
    title: "Fight Club",
    posterPath: null,
    date: TODAY,
    movieReleaseSource: "primary",
    seasonNumber: null,
    episodeNumber: null,
    episodeName: null,
    stillPath: null,
    ...overrides,
  };
}

describe("sanitizeCalendarSeeds", () => {
  it("keeps a well-formed entry", () => {
    expect(
      sanitizeCalendarSeeds([
        {
          id: 1396,
          mediaType: "tv",
          title: "Breaking Bad",
          posterPath: "/poster.jpg",
          releaseDate: "2008-01-20",
        },
      ]),
    ).toEqual([
      {
        id: 1396,
        mediaType: "tv",
        title: "Breaking Bad",
        posterPath: "/poster.jpg",
        releaseDate: "2008-01-20",
      },
    ]);
  });

  it("rejects a payload that is not an array", () => {
    expect(sanitizeCalendarSeeds(undefined)).toEqual([]);
    expect(sanitizeCalendarSeeds(null)).toEqual([]);
    expect(sanitizeCalendarSeeds("[]")).toEqual([]);
    expect(sanitizeCalendarSeeds({ id: 550, mediaType: "movie" })).toEqual([]);
  });

  it("drops entries without a usable id or media type", () => {
    expect(
      sanitizeCalendarSeeds([
        { id: 0, mediaType: "movie" },
        { id: -1, mediaType: "movie" },
        { id: 1.5, mediaType: "movie" },
        { id: "550", mediaType: "movie" },
        { id: 550, mediaType: "person" },
        { id: 550 },
      ]),
    ).toEqual([]);
  });

  it("keeps the same id under both media types", () => {
    // TMDB numbers movies and shows separately, so 550 can legitimately be both.
    expect(
      sanitizeCalendarSeeds([
        { id: 550, mediaType: "movie" },
        { id: 550, mediaType: "tv" },
      ]),
    ).toHaveLength(2);
  });

  it("de-duplicates a repeated title", () => {
    expect(
      sanitizeCalendarSeeds([
        { id: 550, mediaType: "movie" },
        { id: 550, mediaType: "movie" },
      ]),
    ).toHaveLength(1);
  });

  it("discards a release date that is not a plain date", () => {
    const [seed] = sanitizeCalendarSeeds([
      { id: 550, mediaType: "movie", releaseDate: "1999-10-15T00:00:00.000Z" },
    ]);

    expect(seed.releaseDate).toBeNull();
  });

  it("discards a release date the calendar does not have", () => {
    const [seed] = sanitizeCalendarSeeds([
      { id: 550, mediaType: "movie", releaseDate: "2026-02-30" },
    ]);

    expect(seed.releaseDate).toBeNull();
  });
});

// Every date that reaches the `.ics` export has been through this check – the
// episode air dates, the movie release dates and the stored seeds. A shape-only
// test let "2026-02-30" through, and it was written out as
// `DTSTART;VALUE=DATE:20260230`.
describe("isDateOnly", () => {
  it("accepts a plain date that exists", () => {
    expect(isDateOnly("2026-08-01")).toBe(true);
    expect(isDateOnly("2028-02-29")).toBe(true);
  });

  it("refuses a day that does not exist", () => {
    expect(isDateOnly("2026-02-30")).toBe(false);
    expect(isDateOnly("2026-02-29")).toBe(false);
    expect(isDateOnly("2026-04-31")).toBe(false);
    expect(isDateOnly("2026-13-01")).toBe(false);
  });

  it("refuses anything that is not a plain date", () => {
    expect(isDateOnly("")).toBe(false);
    expect(isDateOnly(null)).toBe(false);
    expect(isDateOnly(20260801)).toBe(false);
    expect(isDateOnly("2026-08-01T00:00:00Z")).toBe(false);
  });
});

describe("selectCalendarCandidates", () => {
  it("keeps every followed show, however old", () => {
    const { shows } = selectCalendarCandidates(
      [movieSeed({ id: 1396, mediaType: "tv", releaseDate: "2008-01-20" })],
      TODAY,
    );

    expect(shows).toHaveLength(1);
  });

  it("skips films that came out long ago", () => {
    const { movies } = selectCalendarCandidates([movieSeed()], TODAY);

    expect(movies).toEqual([]);
  });

  it("keeps a film that is still to come", () => {
    const { movies } = selectCalendarCandidates(
      [movieSeed({ releaseDate: "2026-12-25" })],
      TODAY,
    );

    expect(movies).toHaveLength(1);
  });

  it("keeps a film released just now, in case its date slipped", () => {
    const { movies } = selectCalendarCandidates(
      [movieSeed({ releaseDate: shiftDate(TODAY, -10) })],
      TODAY,
    );

    expect(movies).toHaveLength(1);
  });

  it("keeps a film with no date, which is the announced-but-unscheduled case", () => {
    const { movies } = selectCalendarCandidates(
      [movieSeed({ releaseDate: null })],
      TODAY,
    );

    expect(movies).toHaveLength(1);
  });

  it("caps each media type separately", () => {
    const seeds = [
      ...Array.from({ length: 50 }, (_, index) =>
        movieSeed({ id: index + 1, releaseDate: "2026-12-25" }),
      ),
      ...Array.from({ length: 50 }, (_, index) =>
        movieSeed({ id: index + 1, mediaType: "tv" as const }),
      ),
    ];

    const { shows, movies, eligible } = selectCalendarCandidates(seeds, TODAY);

    // A long film watchlist must not crowd the shows out of the payload.
    expect(movies).toHaveLength(40);
    expect(shows).toHaveLength(30);
    // ...and the page has to be able to say the list was longer than that.
    expect(eligible).toBe(100);
  });

  it("counts as eligible only what was worth a read", () => {
    const { eligible } = selectCalendarCandidates(
      [
        movieSeed({ id: 1, mediaType: "tv" }),
        movieSeed({ id: 2, releaseDate: "2026-12-25" }),
        // Long released: skipped on purpose, so not a title left unchecked.
        movieSeed({ id: 3, releaseDate: "1999-10-15" }),
      ],
      TODAY,
    );

    expect(eligible).toBe(2);
  });

  it("reports nothing left over when everything fits", () => {
    const { shows, movies, eligible } = selectCalendarCandidates(
      [movieSeed({ id: 1, mediaType: "tv" }), movieSeed({ id: 2, releaseDate: null })],
      TODAY,
    );

    expect(shows.length + movies.length).toBe(eligible);
  });

  it("checks older dates for the regional calendar while keeping upcoming films ahead of the cap", () => {
    const oldMovies = Array.from({ length: 45 }, (_, index) =>
      movieSeed({ id: index + 1 }),
    );
    const { movies, eligible } = selectCalendarCandidates(
      [...oldMovies, movieSeed({ id: 550, releaseDate: "2026-12-25" }), movieSeed({ id: 551, releaseDate: null })],
      TODAY,
      { includeReleasedMovies: true },
    );

    expect(movies).toHaveLength(40);
    expect(movies.slice(0, 2).map((seed) => seed.id)).toEqual([550, 551]);
    expect(eligible).toBe(47);
  });
});

describe("groupCalendarEvents", () => {
  it("splits events across the planning horizons", () => {
    const buckets = groupCalendarEvents(
      [
        event({ key: "a", date: TODAY }),
        event({ key: "b", date: shiftDate(TODAY, 3) }),
        event({ key: "c", date: shiftDate(TODAY, 20) }),
        event({ key: "d", date: shiftDate(TODAY, 200) }),
      ],
      TODAY,
    );

    expect(buckets.map((bucket) => bucket.id)).toEqual([
      "today",
      "this-week",
      "this-month",
      "later",
    ]);
    expect(buckets.map((bucket) => bucket.events[0].key)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("drops buckets that would render an empty heading", () => {
    const buckets = groupCalendarEvents(
      [event({ date: shiftDate(TODAY, 200) })],
      TODAY,
    );

    expect(buckets.map((bucket) => bucket.id)).toEqual(["later"]);
  });

  it("puts the seventh day in the week bucket and the eighth in the month one", () => {
    const buckets = groupCalendarEvents(
      [
        event({ key: "day-7", date: shiftDate(TODAY, 7) }),
        event({ key: "day-8", date: shiftDate(TODAY, 8) }),
      ],
      TODAY,
    );

    expect(buckets.map((bucket) => bucket.id)).toEqual([
      "this-week",
      "this-month",
    ]);
  });

  it("names the rolling 30-day horizon accurately across a month boundary", () => {
    const today = "2026-10-30";
    const buckets = groupCalendarEvents(
      [
        event({ key: "next-month", date: "2026-11-15" }),
        event({ key: "day-30", date: shiftDate(today, 30) }),
        event({ key: "day-31", date: shiftDate(today, 31) }),
      ],
      today,
    );

    expect(buckets.map((bucket) => ({ label: bucket.label, keys: bucket.events.map((item) => item.key) })))
      .toEqual([
        { label: "Next 30 days", keys: ["next-month", "day-30"] },
        { label: "Further ahead", keys: ["day-31"] },
      ]);
  });

  it("returns nothing for an empty calendar", () => {
    expect(groupCalendarEvents([], TODAY)).toEqual([]);
  });

  it("returns nothing rather than throwing before a reference date is known", () => {
    // The calendar page evaluates this in a `useMemo` on its first render, when
    // the server has not yet said what "today" is.
    expect(groupCalendarEvents([], "")).toEqual([]);
    expect(groupCalendarEvents([event()], "")).toEqual([]);
    expect(groupCalendarEvents([event()], "not-a-date")).toEqual([]);
  });
});
