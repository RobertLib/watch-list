import {
  decodeSharedList,
  encodeSharedList,
  MAX_SHARED_LIST_ITEMS,
  type SharedListRef,
} from "./shared-list";
import { shiftDate, type CalendarSeed } from "./release-calendar";

/**
 * The release calendar as a URL a calendar app can subscribe to.
 *
 * The downloaded `.ics` is a snapshot: it holds the episodes that were scheduled
 * the day it was saved and never learns about the next season. A subscription is
 * the same data behind a URL the calendar app re-fetches on its own – which is
 * the only way this app can reach somebody who is not currently looking at it,
 * and it still costs no account and no record on the server.
 *
 * The list travels in the path, in the same encoding share links already use:
 *
 *   /api/calendar/t1396.t1399.m550.ics
 *
 * That is the whole trick. A subscription usually means a row in a table keyed by
 * a token; here the token *is* the list, so there is nothing to store and nothing
 * to lose. The cost is a URL that names what someone follows, so it is treated as
 * unlisted rather than private – the same bargain as a share link.
 */

/** Calendar clients sniff the extension, so the URL ends in one. */
export const CALENDAR_FEED_EXTENSION = ".ics";

/**
 * A feed is one URL and a URL has a practical length, so the same cap as a share
 * link applies. Shows are kept ahead of films when it bites: a series produces an
 * event every week, while a film produces one, once.
 */
export const MAX_FEED_ITEMS = MAX_SHARED_LIST_ITEMS;

// A film released this long ago is never going to appear on an upcoming
// calendar, so it only takes up room in the URL. Matches the grace period the
// server applies when it decides which seeds are worth a TMDB read.
const RELEASED_GRACE_DAYS = 45;

/**
 * Which of the followed titles are worth putting in the feed URL.
 *
 * Every show, because the point of the feed is finding out when one comes back.
 * Films only while they might still be ahead of us – a watchlist is mostly things
 * that came out years ago.
 */
export function selectFeedRefs(
  seeds: CalendarSeed[],
  today: string,
): SharedListRef[] {
  const cutoff = shiftDate(today, -RELEASED_GRACE_DAYS);

  const shows: SharedListRef[] = [];
  const movies: SharedListRef[] = [];

  for (const seed of seeds) {
    if (seed.mediaType === "tv") {
      shows.push({ id: seed.id, mediaType: "tv" });
      continue;
    }

    if (seed.releaseDate === null || seed.releaseDate >= cutoff) {
      movies.push({ id: seed.id, mediaType: "movie" });
    }
  }

  return [...shows, ...movies].slice(0, MAX_FEED_ITEMS);
}

/** The path the feed lives at, or an empty string when there is nothing to feed. */
export function buildCalendarFeedPath(refs: SharedListRef[]): string {
  const encoded = encodeSharedList(refs);
  if (!encoded) return "";

  return `/api/calendar/${encoded}${CALENDAR_FEED_EXTENSION}`;
}

/**
 * Read the ids back out of the route segment.
 *
 * The extension is optional on the way in: a calendar client that rewrites the
 * URL, or a person who trimmed it by hand, should still get their calendar.
 */
export function parseCalendarFeedSegment(segment: string): SharedListRef[] {
  if (typeof segment !== "string") return [];

  const withoutExtension = segment.toLowerCase().endsWith(CALENDAR_FEED_EXTENSION)
    ? segment.slice(0, -CALENDAR_FEED_EXTENSION.length)
    : segment;

  return decodeSharedList(withoutExtension);
}

/**
 * The same URL under the `webcal:` scheme.
 *
 * Clicking one hands the address to the desktop calendar app instead of opening
 * it in a tab, which turns subscribing into a single click. Falls back to the
 * original string if it is not a URL we recognise – on a phone the plain https
 * link is what works anyway.
 */
export function toWebcalUrl(absoluteUrl: string): string {
  if (absoluteUrl.startsWith("https://")) {
    return `webcal://${absoluteUrl.slice("https://".length)}`;
  }
  if (absoluteUrl.startsWith("http://")) {
    return `webcal://${absoluteUrl.slice("http://".length)}`;
  }

  return absoluteUrl;
}
