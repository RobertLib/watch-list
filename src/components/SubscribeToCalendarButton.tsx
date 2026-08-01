"use client";

import { useMemo, useState } from "react";
import { Bell, Check, Copy, Rss } from "lucide-react";
import { toast } from "@/components/Toast";
import {
  buildCalendarFeedPath,
  MAX_FEED_ITEMS,
  selectFeedRefs,
  toWebcalUrl,
} from "@/lib/calendar-feed";
import type { CalendarSeed } from "@/lib/release-calendar";

/**
 * Subscribe the visitor's own calendar app to their release calendar.
 *
 * The downloaded `.ics` next to this button is a snapshot – it knows the episodes
 * that were scheduled the day it was saved. This hands over a URL instead, and
 * the calendar app keeps asking it for more. That is what turns the calendar from
 * something you have to remember to check into something that taps you on the
 * shoulder, which is the whole point.
 */
export function SubscribeToCalendarButton({
  seeds,
  today,
}: {
  seeds: CalendarSeed[];
  today: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const refs = useMemo(
    // `today` is the server's, handed down with the calendar – a browser in
    // Auckland is already a day ahead and would drop a film released this
    // morning out of the feed.
    () => (today ? selectFeedRefs(seeds, today) : []),
    [seeds, today],
  );

  // `window` is only touched after mount, so the URL is built lazily rather than
  // during render – the panel is closed until someone asks for it anyway.
  function feedUrls(): { https: string; webcal: string } | null {
    const path = buildCalendarFeedPath(refs);
    if (!path || typeof window === "undefined") return null;

    const https = `${window.location.origin}${path}`;
    return { https, webcal: toWebcalUrl(https) };
  }

  const urls = isOpen ? feedUrls() : null;

  async function copy() {
    const built = feedUrls();
    if (!built) return;

    try {
      await navigator.clipboard.writeText(built.https);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.showToast("Could not copy the calendar link", "error");
    }
  }

  if (refs.length === 0) return null;

  return (
    <div className="w-full">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="calendar-subscribe-panel"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        <Bell className="w-4 h-4" aria-hidden="true" />
        Subscribe
      </button>

      {isOpen && (
        <div
          id="calendar-subscribe-panel"
          className="mt-4 rounded-xl border border-gray-800 bg-gray-900/60 p-5 space-y-4"
        >
          <div className="flex items-start gap-3">
            <Rss
              className="w-5 h-5 text-blue-400 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <h3 className="font-semibold text-white">
                A calendar that keeps itself up to date
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Add this link to Google, Apple or Outlook Calendar once. New
                episodes of the {refs.length} title
                {refs.length === 1 ? "" : "s"} you follow appear on their own, and
                each one comes with a reminder at 9am on the day.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              readOnly
              value={urls?.https ?? ""}
              onFocus={(event) => event.currentTarget.select()}
              aria-label="Calendar subscription link"
              className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-black/60 border border-gray-700 text-sm text-gray-300 font-mono focus:outline-none focus:border-blue-500"
            />
            <div className="flex gap-2 shrink-0">
              <button
                onClick={copy}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-400" aria-hidden="true" />
                ) : (
                  <Copy className="w-4 h-4" aria-hidden="true" />
                )}
                {copied ? "Copied" : "Copy"}
              </button>
              {urls && (
                // `webcal:` is what makes this one click on a desktop – the OS
                // hands it straight to the calendar app. Phones mostly want the
                // https link pasted in, which is why both are offered.
                <a
                  href={urls.webcal}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  Open in app
                </a>
              )}
            </div>
          </div>

          <details className="text-sm text-gray-400">
            <summary className="cursor-pointer text-gray-300 hover:text-white transition-colors">
              How to add it
            </summary>
            <ul className="mt-3 space-y-2 pl-1">
              <li>
                <span className="text-gray-300">Google Calendar:</span> Other
                calendars → + → From URL → paste.
              </li>
              <li>
                <span className="text-gray-300">Apple Calendar:</span> File → New
                Calendar Subscription → paste. On iPhone: Settings → Apps →
                Calendar → Accounts → Add Account → Other → Add Subscribed
                Calendar.
              </li>
              <li>
                <span className="text-gray-300">Outlook:</span> Add calendar →
                Subscribe from web → paste.
              </li>
            </ul>
          </details>

          <p className="text-xs text-gray-500 leading-relaxed">
            The link carries the titles themselves, which is how this works
            without an account – so treat it as unlisted, and generate a new one
            by changing what you follow. It covers up to {MAX_FEED_ITEMS} titles,
            series first.
          </p>
        </div>
      )}
    </div>
  );
}
