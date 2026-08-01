import { NextResponse, type NextRequest } from "next/server";
import {
  buildCalendarIcs,
  DEFAULT_REFRESH_HOURS,
} from "@/lib/calendar-ics";
import { parseCalendarFeedSegment } from "@/lib/calendar-feed";
import { getReleaseCalendarFor } from "@/lib/release-calendar-server";
import type { CalendarSeed } from "@/lib/release-calendar";

/**
 * The release calendar as a live feed.
 *
 * A calendar app subscribed to this URL re-fetches it on its own schedule, which
 * makes it the one channel this app has for reaching somebody who is not
 * currently on it – the reminder arrives on their phone when an episode airs,
 * months after they last opened the site. No account, no push subscription, and
 * nothing stored here: the titles are named by the URL itself.
 *
 * That is also the security model. The path is a capability, like a share link:
 * anyone holding it can see what its owner follows. There is nothing more
 * sensitive behind it – no name, no history, no settings – and the alternative
 * (an opaque token) means a table to keep it in.
 */

// The URL names the titles, so a crawler that finds one should not pass it on.
const NOINDEX = "noindex, nofollow";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ items: string }> },
) {
  const { items } = await params;
  const refs = parseCalendarFeedSegment(items);

  // An unparseable feed still answers with a calendar rather than a 404: a
  // calendar app that gets an error tends to unsubscribe, and a link that lost a
  // character in a chat app would be gone for good.
  if (refs.length === 0) {
    return icsResponse(
      buildCalendarIcs([], {
        baseUrl: request.nextUrl.origin,
        now: new Date(),
        calendarName: "WatchList releases",
        refreshHours: DEFAULT_REFRESH_HOURS,
      }),
    );
  }

  // The feed carries ids and nothing else, so every field the calendar renders
  // comes from TMDB. The seeds exist only to say what to look up.
  const seeds: CalendarSeed[] = refs.map((ref) => ({
    id: ref.id,
    mediaType: ref.mediaType,
    title: "",
    posterPath: null,
    releaseDate: null,
  }));

  const today = new Date().toISOString().slice(0, 10);

  try {
    const calendar = await getReleaseCalendarFor(seeds, today);

    return icsResponse(
      buildCalendarIcs(calendar.events, {
        baseUrl: request.nextUrl.origin,
        now: new Date(),
        calendarName: "WatchList releases",
        alarms: true,
        refreshHours: DEFAULT_REFRESH_HOURS,
      }),
    );
  } catch (error) {
    console.error("Error building the calendar feed:", error);

    // Same reasoning as above: an empty calendar keeps the subscription alive
    // through a TMDB outage, where a 500 might not.
    return icsResponse(
      buildCalendarIcs([], {
        baseUrl: request.nextUrl.origin,
        now: new Date(),
        calendarName: "WatchList releases",
        refreshHours: DEFAULT_REFRESH_HOURS,
      }),
    );
  }
}

function icsResponse(body: string): NextResponse {
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // `inline` rather than `attachment`: a browser opening the URL should hand
      // it to the calendar app, not drop a file in Downloads.
      "Content-Disposition": 'inline; filename="watchlist-releases.ics"',
      // An hour at the edge. The underlying TMDB reads are cached for six, so
      // this mostly protects against a client that polls far harder than the
      // refresh interval asks it to.
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "X-Robots-Tag": NOINDEX,
    },
  });
}
