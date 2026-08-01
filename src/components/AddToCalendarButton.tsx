"use client";

import { useState } from "react";
import { CalendarPlus, Check } from "lucide-react";
import { buildCalendarIcs } from "@/lib/calendar-ics";
import type { CalendarEvent } from "@/lib/release-calendar";

/**
 * Hand the calendar to the visitor's own calendar app as an `.ics` download.
 *
 * Built in the browser rather than served from a route: the events are already
 * on this page, and a server-side file would mean either a subscription URL to
 * store or the whole watchlist smuggled through a query string.
 */
export function AddToCalendarButton({ events }: { events: CalendarEvent[] }) {
  const [saved, setSaved] = useState(false);

  if (events.length === 0) return null;

  function download() {
    const ics = buildCalendarIcs(events, {
      baseUrl: window.location.origin,
      now: new Date(),
    });

    const url = URL.createObjectURL(
      new Blob([ics], { type: "text/calendar;charset=utf-8" }),
    );

    const link = document.createElement("a");
    link.href = url;
    link.download = "watchlist-releases.ics";
    link.click();
    // Revoking immediately can cancel the download in some browsers, so the
    // object URL is released once the click has certainly been handled.
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <button
      onClick={download}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {saved ? (
        <Check className="w-4 h-4 text-green-400" aria-hidden="true" />
      ) : (
        <CalendarPlus className="w-4 h-4" aria-hidden="true" />
      )}
      {saved ? "Downloaded" : "Add to my calendar"}
    </button>
  );
}
