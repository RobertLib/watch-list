import { describe, expect, it } from "vitest";
import {
  buildCalendarFeedPath,
  MAX_FEED_ITEMS,
  parseCalendarFeedSegment,
  selectFeedRefs,
  toWebcalUrl,
} from "./calendar-feed";
import type { CalendarSeed } from "./release-calendar";

const TODAY = "2026-08-01";

function seed(overrides: Partial<CalendarSeed> = {}): CalendarSeed {
  return {
    id: 550,
    mediaType: "movie",
    title: "Fight Club",
    posterPath: null,
    releaseDate: null,
    ...overrides,
  };
}

describe("selectFeedRefs", () => {
  it("keeps every followed show", () => {
    const refs = selectFeedRefs(
      [seed({ id: 1396, mediaType: "tv", releaseDate: "2008-01-20" })],
      TODAY,
    );

    expect(refs).toEqual([{ id: 1396, mediaType: "tv" }]);
  });

  it("drops a film that came out long ago", () => {
    expect(selectFeedRefs([seed({ releaseDate: "1999-10-15" })], TODAY)).toEqual(
      [],
    );
  });

  it("keeps a film with no date, which is the announced-but-unscheduled case", () => {
    expect(selectFeedRefs([seed({ releaseDate: null })], TODAY)).toHaveLength(1);
  });

  it("keeps a film released within the grace window, in case its date slipped", () => {
    expect(
      selectFeedRefs([seed({ releaseDate: "2026-07-20" })], TODAY),
    ).toHaveLength(1);
  });

  it("puts shows ahead of films, so the cap never costs a series", () => {
    const seeds = [
      seed({ id: 1, mediaType: "movie" }),
      seed({ id: 2, mediaType: "tv" }),
    ];

    expect(selectFeedRefs(seeds, TODAY).map((ref) => ref.mediaType)).toEqual([
      "tv",
      "movie",
    ]);
  });

  it("bounds the feed, because it has to fit in a URL", () => {
    const seeds = Array.from({ length: MAX_FEED_ITEMS + 20 }, (_, index) =>
      seed({ id: index + 1, mediaType: "tv" }),
    );

    expect(selectFeedRefs(seeds, TODAY)).toHaveLength(MAX_FEED_ITEMS);
  });
});

describe("buildCalendarFeedPath", () => {
  it("builds a path a calendar client will accept", () => {
    expect(
      buildCalendarFeedPath([
        { id: 1396, mediaType: "tv" },
        { id: 550, mediaType: "movie" },
      ]),
    ).toBe("/api/calendar/t1396.m550.ics");
  });

  it("has no path to offer for an empty list", () => {
    expect(buildCalendarFeedPath([])).toBe("");
  });
});

describe("parseCalendarFeedSegment", () => {
  it("round-trips what the builder produced", () => {
    const refs = [
      { id: 1396, mediaType: "tv" as const },
      { id: 550, mediaType: "movie" as const },
    ];
    const segment = buildCalendarFeedPath(refs).split("/").pop()!;

    expect(parseCalendarFeedSegment(segment)).toEqual(refs);
  });

  it("accepts the segment without its extension", () => {
    expect(parseCalendarFeedSegment("t1396")).toEqual([
      { id: 1396, mediaType: "tv" },
    ]);
  });

  it("ignores tokens it does not recognise rather than failing the feed", () => {
    expect(parseCalendarFeedSegment("t1396.xyz.m550.ics")).toEqual([
      { id: 1396, mediaType: "tv" },
      { id: 550, mediaType: "movie" },
    ]);
  });

  it("returns nothing for junk", () => {
    expect(parseCalendarFeedSegment("../../etc/passwd")).toEqual([]);
    expect(parseCalendarFeedSegment("")).toEqual([]);
  });
});

describe("toWebcalUrl", () => {
  it("swaps the scheme so the OS opens a calendar app", () => {
    expect(toWebcalUrl("https://www.watch-list.me/api/calendar/t1.ics")).toBe(
      "webcal://www.watch-list.me/api/calendar/t1.ics",
    );
  });

  it("works in development too", () => {
    expect(toWebcalUrl("http://localhost:3000/api/calendar/t1.ics")).toBe(
      "webcal://localhost:3000/api/calendar/t1.ics",
    );
  });

  it("leaves anything else alone", () => {
    expect(toWebcalUrl("/api/calendar/t1.ics")).toBe("/api/calendar/t1.ics");
  });
});
