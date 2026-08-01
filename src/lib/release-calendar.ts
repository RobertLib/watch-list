// Types and pure logic only. The TMDB reads live in `release-calendar-server.ts`
// because the calendar page groups these events in the browser, and importing a
// `server-only` module from a Client Component is a hard error.
import type { MediaType } from "@/types/tmdb";

/** A title the visitor is following, reduced to what the calendar needs. */
export interface CalendarSeed {
  id: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  /** What the client last stored, used only to skip long-released movies. */
  releaseDate: string | null;
}

export interface CalendarEvent {
  /** Stable across refetches, so React keeps the same node. */
  key: string;
  id: number;
  mediaType: MediaType;
  slug: string;
  title: string;
  posterPath: string | null;
  /** Plain `YYYY-MM-DD`, as TMDB reports it. */
  date: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeName: string | null;
  stillPath: string | null;
}

/** A followed show that is coming back, but with no date announced yet. */
export interface AwaitedShow {
  id: number;
  slug: string;
  title: string;
  posterPath: string | null;
  /** TMDB's wording, e.g. "Returning Series". */
  status: string;
}

export interface ReleaseCalendar {
  events: CalendarEvent[];
  awaiting: AwaitedShow[];
  /**
   * The date the window was computed against. Returned rather than re-derived on
   * the client so "Today" means the same thing in both places – a browser in
   * Auckland is already a day ahead of the server that filtered these events.
   */
  today: string;
}

// Each seed costs one TMDB read, so the payload is bounded. Both caps are per
// media type, which keeps a watchlist of 90 films from crowding out the shows.
const MAX_SHOWS = 30;
const MAX_MOVIES = 40;
const MAX_TITLE_LENGTH = 200;
// A film whose stored date is this far past is never going to become upcoming,
// so it is dropped before it costs a request. The window rather than "today"
// because a release can slip backwards in TMDB after being pushed.
const RELEASED_GRACE_DAYS = 45;

/**
 * A server action is a public endpoint and the payload comes out of browser
 * storage, so the seeds are rebuilt from the fields we understand and bounded.
 */
export function sanitizeCalendarSeeds(input: unknown): CalendarSeed[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const seeds: CalendarSeed[] = [];

  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;

    const { id, mediaType, title, posterPath, releaseDate } = entry as Record<
      string,
      unknown
    >;

    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) continue;
    if (mediaType !== "movie" && mediaType !== "tv") continue;

    const key = `${mediaType}-${id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    seeds.push({
      id,
      mediaType,
      title: typeof title === "string" ? title.slice(0, MAX_TITLE_LENGTH) : "",
      posterPath: typeof posterPath === "string" ? posterPath : null,
      releaseDate: isDateOnly(releaseDate) ? releaseDate : null,
    });
  }

  return seeds;
}

/** TMDB reports dates as plain `YYYY-MM-DD`, and empty strings for "unknown". */
export function isDateOnly(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** `YYYY-MM-DD` shifted by whole days, without leaving the string domain. */
export function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Which seeds are worth a TMDB read.
 *
 * Every followed show is: the whole point is finding out whether it is coming
 * back. Films are filtered on the date the client already holds, because a
 * watchlist is mostly titles that came out years ago and each one would
 * otherwise cost a request to learn nothing.
 */
export function selectCalendarCandidates(
  seeds: CalendarSeed[],
  today: string,
): { shows: CalendarSeed[]; movies: CalendarSeed[] } {
  const cutoff = shiftDate(today, -RELEASED_GRACE_DAYS);

  const shows = seeds
    .filter((seed) => seed.mediaType === "tv")
    .slice(0, MAX_SHOWS);

  const movies = seeds
    .filter(
      (seed) =>
        seed.mediaType === "movie" &&
        // A missing date usually means "announced, no date yet", which is
        // exactly the case worth checking.
        (seed.releaseDate === null || seed.releaseDate >= cutoff),
    )
    .slice(0, MAX_MOVIES);

  return { shows, movies };
}

export type CalendarBucketId = "today" | "this-week" | "this-month" | "later";

export interface CalendarBucket {
  id: CalendarBucketId;
  label: string;
  events: CalendarEvent[];
}

/**
 * Group events into the horizons people actually plan around. Empty buckets are
 * dropped so a calendar holding one distant release does not render three empty
 * headings above it.
 */
export function groupCalendarEvents(
  events: CalendarEvent[],
  today: string,
): CalendarBucket[] {
  // Nothing to place, or no reference date to place it against. The second case
  // is the calendar page's first render, before its request has come back: this
  // runs in a `useMemo` that React evaluates whether or not the result is used,
  // and `shiftDate` on an empty string throws – which took the whole page to the
  // error boundary rather than showing a spinner.
  if (events.length === 0 || !isDateOnly(today)) return [];

  const weekEnd = shiftDate(today, 7);
  const monthEnd = shiftDate(today, 30);

  const buckets: CalendarBucket[] = [
    { id: "today", label: "Today", events: [] },
    { id: "this-week", label: "Next 7 days", events: [] },
    { id: "this-month", label: "Later this month", events: [] },
    { id: "later", label: "Further ahead", events: [] },
  ];

  const byId = (id: CalendarBucketId) =>
    buckets.find((bucket) => bucket.id === id)!;

  for (const event of events) {
    if (event.date <= today) byId("today").events.push(event);
    else if (event.date <= weekEnd) byId("this-week").events.push(event);
    else if (event.date <= monthEnd) byId("this-month").events.push(event);
    else byId("later").events.push(event);
  }

  return buckets.filter((bucket) => bucket.events.length > 0);
}
