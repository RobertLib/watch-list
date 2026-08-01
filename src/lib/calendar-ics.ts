import type { CalendarEvent } from "./release-calendar";

/**
 * iCalendar export for the release calendar.
 *
 * The point of the file is to get these dates *out* of the site: a reminder
 * sitting in someone's own calendar app is what brings them back on the day an
 * episode airs, and it needs no push subscription and no server-side state.
 */

// RFC 5545 §3.1: content lines are folded at 75 octets, continuation lines
// starting with a single space. Long episode titles hit this routinely, and a
// calendar app that receives an over-long line may drop the whole event.
const MAX_LINE_OCTETS = 75;
const PRODUCT_ID = "-//WatchList//Release Calendar//EN";

/** Escape a TEXT value. Order matters: the backslash has to go first. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// `TextEncoder` rather than `Buffer`: this module is imported by the download
// button, which runs in the browser.
const encoder = new TextEncoder();

function octets(value: string): number {
  return encoder.encode(value).length;
}

function foldLine(line: string): string[] {
  if (octets(line) <= MAX_LINE_OCTETS) return [line];

  const parts: string[] = [];
  let current = "";
  let currentOctets = 0;
  // The first line may spend all 75 octets; every continuation spends one on its
  // leading space. The walk is over characters rather than bytes so a multi-byte
  // character is never cut in half.
  let limit = MAX_LINE_OCTETS;

  for (const char of line) {
    const size = octets(char);
    if (currentOctets + size > limit) {
      parts.push(current);
      current = "";
      currentOctets = 0;
      limit = MAX_LINE_OCTETS - 1;
    }
    current += char;
    currentOctets += size;
  }

  if (current) parts.push(current);

  return parts.map((part, index) => (index === 0 ? part : ` ${part}`));
}

/** `2026-08-03` → `20260803`, the DATE form an all-day event needs. */
function toIcsDate(date: string): string {
  return date.replace(/-/g, "");
}

/** `YYYY-MM-DD` plus whole days, kept in the string domain. */
function nextDay(date: string): string {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + 1);
  return toIcsDate(shifted.toISOString().slice(0, 10));
}

export function episodeCode(
  seasonNumber: number,
  episodeNumber: number,
): string {
  return `S${String(seasonNumber).padStart(2, "0")}E${String(
    episodeNumber,
  ).padStart(2, "0")}`;
}

function summaryFor(event: CalendarEvent): string {
  if (event.mediaType === "movie") {
    return `${event.title} – in cinemas`;
  }

  const code =
    event.seasonNumber !== null && event.episodeNumber !== null
      ? episodeCode(event.seasonNumber, event.episodeNumber)
      : "";
  const parts = [event.title, code, event.episodeName].filter(Boolean);

  return parts.join(" · ");
}

export interface IcsOptions {
  /** Site origin, so each event links back to the title's page. */
  baseUrl: string;
  /** `DTSTAMP`, passed in rather than read from the clock so this stays pure. */
  now: Date;
}

function toIcsTimestamp(now: Date): string {
  return `${now.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;
}

export function buildCalendarIcs(
  events: CalendarEvent[],
  { baseUrl, now }: IcsOptions,
): string {
  const dtstamp = toIcsTimestamp(now);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODUCT_ID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:WatchList releases",
  ];

  for (const event of events) {
    const url = `${baseUrl}/${event.mediaType}/${event.slug}`;

    lines.push(
      "BEGIN:VEVENT",
      // Stable per title and episode, so re-importing updates the existing entry
      // instead of leaving a duplicate behind.
      `UID:${event.key}@watch-list.me`,
      `DTSTAMP:${dtstamp}`,
      // An all-day event: TMDB gives a date and no broadcast time, and inventing
      // one would put the reminder in the wrong place for most of the world.
      `DTSTART;VALUE=DATE:${toIcsDate(event.date)}`,
      `DTEND;VALUE=DATE:${nextDay(event.date)}`,
      `SUMMARY:${escapeText(summaryFor(event))}`,
      `DESCRIPTION:${escapeText(url)}`,
      `URL:${escapeText(url)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  // CRLF is what the spec requires, and some calendar clients reject bare LF.
  return `${lines.flatMap(foldLine).join("\r\n")}\r\n`;
}
