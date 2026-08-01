import { describe, expect, it } from "vitest";
import {
  groupCalendarEvents,
  sanitizeCalendarSeeds,
  selectCalendarCandidates,
  shiftDate,
  type CalendarEvent,
  type CalendarSeed,
} from "./release-calendar";

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
    seasonNumber: null,
    episodeNumber: null,
    episodeName: null,
    stillPath: null,
    ...overrides,
  };
}

describe("shiftDate", () => {
  it("moves by whole days", () => {
    expect(shiftDate("2026-08-01", 7)).toBe("2026-08-08");
    expect(shiftDate("2026-08-01", -1)).toBe("2026-07-31");
  });

  it("crosses month and year boundaries", () => {
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDate("2028-02-28", 1)).toBe("2028-02-29");
  });
});

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

    const { shows, movies } = selectCalendarCandidates(seeds, TODAY);

    // A long film watchlist must not crowd the shows out of the payload.
    expect(movies).toHaveLength(40);
    expect(shows).toHaveLength(30);
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
