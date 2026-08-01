import { describe, expect, it } from "vitest";
import { buildCalendarIcs } from "./calendar-ics";
import type { CalendarEvent } from "./release-calendar";

const OPTIONS = {
  baseUrl: "https://www.watch-list.me",
  now: new Date("2026-08-01T09:30:00.000Z"),
};

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    key: "movie-550",
    id: 550,
    mediaType: "movie",
    slug: "fight-club-550",
    title: "Fight Club",
    posterPath: null,
    date: "2026-08-03",
    seasonNumber: null,
    episodeNumber: null,
    episodeName: null,
    stillPath: null,
    ...overrides,
  };
}

const episode = event({
  key: "tv-1396-3-5",
  id: 1396,
  mediaType: "tv",
  slug: "breaking-bad-1396",
  title: "Breaking Bad",
  seasonNumber: 3,
  episodeNumber: 5,
  episodeName: "Más",
});

function lines(ics: string): string[] {
  return ics.split("\r\n");
}

describe("buildCalendarIcs", () => {
  it("wraps events in a valid calendar envelope", () => {
    const ics = buildCalendarIcs([event()], OPTIONS);
    const output = lines(ics);

    expect(output[0]).toBe("BEGIN:VCALENDAR");
    expect(output).toContain("VERSION:2.0");
    expect(output).toContain("END:VCALENDAR");
    // A trailing CRLF leaves an empty final element.
    expect(output.at(-1)).toBe("");
  });

  it("uses CRLF line endings, which some clients insist on", () => {
    expect(buildCalendarIcs([event()], OPTIONS)).not.toMatch(/[^\r]\n/);
  });

  it("emits an all-day event ending the following day", () => {
    const output = lines(buildCalendarIcs([event()], OPTIONS));

    expect(output).toContain("DTSTART;VALUE=DATE:20260803");
    expect(output).toContain("DTEND;VALUE=DATE:20260804");
  });

  it("rolls DTEND over a month boundary", () => {
    const output = lines(
      buildCalendarIcs([event({ date: "2026-08-31" })], OPTIONS),
    );

    expect(output).toContain("DTEND;VALUE=DATE:20260901");
  });

  it("stamps the time it was generated", () => {
    expect(lines(buildCalendarIcs([event()], OPTIONS))).toContain(
      "DTSTAMP:20260801T093000Z",
    );
  });

  it("keys each event so a re-import updates rather than duplicates", () => {
    const output = lines(buildCalendarIcs([episode], OPTIONS));

    expect(output).toContain("UID:tv-1396-3-5@watch-list.me");
  });

  it("describes an episode with its code and title", () => {
    const output = lines(buildCalendarIcs([episode], OPTIONS));

    expect(output).toContain("SUMMARY:Breaking Bad · S03E05 · Más");
  });

  it("describes a film as a cinema release", () => {
    expect(lines(buildCalendarIcs([event()], OPTIONS))).toContain(
      "SUMMARY:Fight Club – in cinemas",
    );
  });

  it("leaves out the episode name when TMDB has none", () => {
    const output = lines(
      buildCalendarIcs([{ ...episode, episodeName: null }], OPTIONS),
    );

    expect(output).toContain("SUMMARY:Breaking Bad · S03E05");
  });

  it("escapes the characters iCalendar reserves", () => {
    const output = lines(
      buildCalendarIcs(
        [{ ...episode, episodeName: "Half; a, comma\\ and\nnewline" }],
        OPTIONS,
      ),
    );

    const summary = output.find((line) => line.startsWith("SUMMARY:"));
    expect(summary).toContain("Half\\; a\\, comma\\\\ and\\nnewline");
  });

  it("links each event back to its page", () => {
    const output = lines(buildCalendarIcs([episode], OPTIONS));

    expect(output).toContain(
      "URL:https://www.watch-list.me/tv/breaking-bad-1396",
    );
  });

  it("folds a long line and marks the continuation with a space", () => {
    const output = lines(
      buildCalendarIcs(
        [{ ...episode, episodeName: "x".repeat(200) }],
        OPTIONS,
      ),
    );

    const summaryIndex = output.findIndex((line) =>
      line.startsWith("SUMMARY:"),
    );
    const continuation = output[summaryIndex + 1];

    expect(output[summaryIndex].length).toBeLessThanOrEqual(75);
    expect(continuation.startsWith(" ")).toBe(true);
    // Unfolding has to reproduce the original value exactly.
    const unfolded = output
      .slice(summaryIndex)
      .reduce<string[]>((acc, line) => {
        if (line.startsWith(" ")) acc[acc.length - 1] += line.slice(1);
        else acc.push(line);
        return acc;
      }, [])[0];

    expect(unfolded).toBe(`SUMMARY:Breaking Bad · S03E05 · ${"x".repeat(200)}`);
  });

  it("never splits a multi-byte character across a fold", () => {
    const output = lines(
      buildCalendarIcs([{ ...episode, episodeName: "é".repeat(80) }], OPTIONS),
    );

    // A byte-wise split would leave a lone surrogate half and this would fail.
    for (const line of output) {
      expect(line).not.toContain("�");
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("produces a calendar with no events when there is nothing scheduled", () => {
    const output = lines(buildCalendarIcs([], OPTIONS));

    expect(output).not.toContain("BEGIN:VEVENT");
    expect(output).toContain("END:VCALENDAR");
  });

  it("adds no alarm unless one is asked for", () => {
    expect(lines(buildCalendarIcs([event()], OPTIONS))).not.toContain(
      "BEGIN:VALARM",
    );
  });

  it("attaches a morning reminder when alarms are on", () => {
    const output = lines(
      buildCalendarIcs([event()], { ...OPTIONS, alarms: true }),
    );

    expect(output).toContain("BEGIN:VALARM");
    expect(output).toContain("ACTION:DISPLAY");
    // Nine hours into an all-day event is 09:00, not the middle of the night.
    expect(output).toContain("TRIGGER:PT9H");
    // The alarm belongs to the event, so it has to close before the event does.
    expect(output.indexOf("END:VALARM")).toBeLessThan(
      output.indexOf("END:VEVENT"),
    );
  });

  it("tells a subscribed client how often to come back", () => {
    const output = lines(
      buildCalendarIcs([event()], { ...OPTIONS, refreshHours: 12 }),
    );

    expect(output).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT12H");
    // Outlook reads the older spelling and ignores the standard one.
    expect(output).toContain("X-PUBLISHED-TTL:PT12H");
  });

  it("omits the refresh hint from a downloaded snapshot", () => {
    const output = lines(buildCalendarIcs([event()], OPTIONS));

    expect(output.some((line) => line.startsWith("REFRESH-INTERVAL"))).toBe(
      false,
    );
  });

  it("names the calendar, escaping the name like any other text value", () => {
    const output = lines(
      buildCalendarIcs([], { ...OPTIONS, calendarName: "Rob; releases" }),
    );

    expect(output).toContain("X-WR-CALNAME:Rob\\; releases");
  });
});
