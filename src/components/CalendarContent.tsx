"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CalendarDays, CalendarClock, Clapperboard, Tv } from "lucide-react";
import { getReleaseCalendar } from "@/app/actions";
import { AddToCalendarButton } from "@/components/AddToCalendarButton";
import { SubscribeToCalendarButton } from "@/components/SubscribeToCalendarButton";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { useEpisodeProgress } from "@/contexts/EpisodeProgressContext";
import { episodeCode } from "@/lib/calendar-ics";
import {
  groupCalendarEvents,
  type AwaitedShow,
  type CalendarEvent,
  type CalendarSeed,
  type ReleaseCalendar,
} from "@/lib/release-calendar";
import { getImageUrl } from "@/lib/tmdb-image";

const EMPTY: ReleaseCalendar = { events: [], awaiting: [], today: "" };

/**
 * The release calendar for everything the visitor follows.
 *
 * Both sources are browser state, so the calendar is requested after mount and
 * the route itself stays static – the same arrangement as the recommendations
 * and the "Continue Watching" row.
 */
export function CalendarContent() {
  const { watchlist, isLoading: isWatchlistLoading } = useWatchlist();
  const { shows, isLoading: isProgressLoading } = useEpisodeProgress();
  const [calendar, setCalendar] = useState<ReleaseCalendar>(EMPTY);
  const [hasLoaded, setHasLoaded] = useState(false);

  const isLoading = isWatchlistLoading || isProgressLoading;

  const seeds = useMemo<CalendarSeed[]>(() => {
    const bySeed = new Map<string, CalendarSeed>();

    for (const item of watchlist) {
      bySeed.set(`${item.mediaType}-${item.id}`, {
        id: item.id,
        mediaType: item.mediaType,
        title: item.title,
        posterPath: item.posterPath,
        releaseDate: item.releaseDate || null,
      });
    }

    // A show someone is part-way through counts as followed even if it was never
    // saved – it is the case most likely to have a new episode this week.
    for (const show of shows) {
      const key = `tv-${show.tvId}`;
      if (bySeed.has(key)) continue;

      bySeed.set(key, {
        id: show.tvId,
        mediaType: "tv",
        title: show.name,
        posterPath: show.posterPath,
        releaseDate: null,
      });
    }

    return [...bySeed.values()];
  }, [watchlist, shows]);

  useEffect(() => {
    if (isLoading) return;

    // Nothing followed, so there is nothing to ask for – but the page still has
    // to stop showing a spinner and render its empty state.
    if (seeds.length === 0) {
      setHasLoaded(true);
      return;
    }

    let isCurrent = true;

    (async () => {
      try {
        const result = await getReleaseCalendar(seeds);
        if (isCurrent) setCalendar(result);
      } catch (error) {
        console.error("Error loading release calendar:", error);
        if (isCurrent) setCalendar(EMPTY);
      } finally {
        if (isCurrent) setHasLoaded(true);
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [seeds, isLoading]);

  const buckets = useMemo(
    () => groupCalendarEvents(calendar.events, calendar.today),
    [calendar],
  );

  if (isLoading || !hasLoaded) {
    return (
      <div className="py-16">
        <LoadingSpinner />
      </div>
    );
  }

  if (seeds.length === 0) return <NothingFollowed />;

  if (calendar.events.length === 0 && calendar.awaiting.length === 0) {
    return <NothingScheduled />;
  }

  return (
    <div className="space-y-12">
      {calendar.events.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-gray-400">
              {calendar.events.length} release
              {calendar.events.length === 1 ? "" : "s"} coming up across{" "}
              {seeds.length} title{seeds.length === 1 ? "" : "s"} you follow.
            </p>
            <AddToCalendarButton events={calendar.events} />
          </div>

          {/* Below the row rather than in it: the panel it opens is full width,
              and the two buttons answer different questions – one takes the
              dates away now, the other keeps taking them. */}
          <SubscribeToCalendarButton seeds={seeds} today={calendar.today} />
        </div>
      )}

      {buckets.map((bucket) => (
        <section key={bucket.id} aria-labelledby={`bucket-${bucket.id}`}>
          <h2
            id={`bucket-${bucket.id}`}
            className="text-xl font-semibold text-white mb-4 flex items-center gap-2"
          >
            <CalendarDays className="w-5 h-5 text-blue-400" aria-hidden="true" />
            {bucket.label}
            <span className="text-gray-500 font-normal text-base">
              ({bucket.events.length})
            </span>
          </h2>
          <ul className="space-y-3">
            {bucket.events.map((event) => (
              <li key={event.key}>
                <EventRow event={event} today={calendar.today} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {calendar.awaiting.length > 0 && (
        <section aria-labelledby="awaiting-heading">
          <h2
            id="awaiting-heading"
            className="text-xl font-semibold text-white mb-2 flex items-center gap-2"
          >
            <CalendarClock
              className="w-5 h-5 text-gray-400"
              aria-hidden="true"
            />
            No date announced
          </h2>
          <p className="text-gray-400 text-sm mb-4">
            These are coming back, but TMDb has no air date for the next episode
            yet.
          </p>
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {calendar.awaiting.map((show) => (
              <li key={show.id}>
                <AwaitingRow show={show} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** "in 3 days" reads better than a bare date for anything close. */
function relativeLabel(date: string, today: string): string | null {
  if (!today) return null;

  const days = Math.round(
    (Date.parse(`${date}T00:00:00.000Z`) -
      Date.parse(`${today}T00:00:00.000Z`)) /
      86_400_000,
  );

  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days <= 30) return `in ${days} days`;
  return null;
}

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function EventRow({
  event,
  today,
}: {
  event: CalendarEvent;
  today: string;
}) {
  const isEpisode = event.mediaType === "tv";
  const relative = relativeLabel(event.date, today);
  const artwork = event.stillPath ?? event.posterPath;
  const code =
    event.seasonNumber !== null && event.episodeNumber !== null
      ? episodeCode(event.seasonNumber, event.episodeNumber)
      : null;

  return (
    <Link
      href={`/${event.mediaType}/${event.slug}`}
      prefetch={false}
      className="flex gap-4 p-3 rounded-xl bg-gray-900/60 border border-gray-800 hover:border-gray-700 hover:bg-gray-900 transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <div
        className={`relative shrink-0 overflow-hidden rounded-lg bg-gray-800 ${
          event.stillPath ? "w-32 aspect-video" : "w-14 aspect-2/3"
        }`}
      >
        {artwork ? (
          <Image
            src={getImageUrl(artwork, "w500")}
            alt={event.title}
            fill
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
            {isEpisode ? (
              <Tv className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Clapperboard className="w-5 h-5" aria-hidden="true" />
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 self-center">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-blue-300">
            {formatDate(event.date)}
          </span>
          {relative && (
            <span className="text-xs rounded-full bg-blue-500/15 text-blue-300 px-2 py-0.5">
              {relative}
            </span>
          )}
        </div>

        <p className="font-semibold text-white group-hover:text-blue-300 transition-colors line-clamp-1 mt-0.5">
          {event.title}
        </p>

        <p className="text-sm text-gray-400 line-clamp-1">
          {isEpisode ? (
            <>
              {code}
              {event.episodeName && ` · ${event.episodeName}`}
            </>
          ) : (
            "In cinemas"
          )}
        </p>
      </div>
    </Link>
  );
}

function AwaitingRow({ show }: { show: AwaitedShow }) {
  return (
    <Link
      href={`/tv/${show.slug}`}
      prefetch={false}
      className="flex gap-3 p-2 rounded-lg bg-gray-900/40 border border-gray-800 hover:border-gray-700 transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <div className="relative w-10 aspect-2/3 shrink-0 overflow-hidden rounded bg-gray-800">
        {show.posterPath ? (
          <Image
            src={getImageUrl(show.posterPath, "w185")}
            alt={show.title}
            fill
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Tv className="w-4 h-4 text-gray-600" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="min-w-0 self-center">
        <p className="text-sm font-medium text-white group-hover:text-blue-300 transition-colors line-clamp-2">
          {show.title}
        </p>
        <p className="text-xs text-gray-500">{show.status}</p>
      </div>
    </Link>
  );
}

function EmptyState({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="text-center py-16">
      <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
        <CalendarDays className="w-10 h-10 text-gray-600" aria-hidden="true" />
      </div>
      <h2 className="text-2xl font-bold mb-3">{title}</h2>
      <p className="text-gray-400 max-w-md mx-auto">{children}</p>
      <Link
        href="/"
        prefetch={false}
        className="mt-6 inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
      >
        Discover Content
      </Link>
    </div>
  );
}

function NothingFollowed() {
  return (
    <EmptyState title="Nothing to schedule yet">
      Save a film or start a series and this page fills up with air dates and
      cinema releases – and hands them to your own calendar app.
    </EmptyState>
  );
}

function NothingScheduled() {
  return (
    <EmptyState title="Nothing on the horizon">
      Everything you follow has already been released, and none of the series has
      a new episode scheduled. Check back once something you saved starts airing.
    </EmptyState>
  );
}
