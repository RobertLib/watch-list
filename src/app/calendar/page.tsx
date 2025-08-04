import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { CalendarContent } from "@/components/CalendarContent";

export const metadata: Metadata = pageMetadata({
  title: "Release Calendar",
  description:
    "Episode air dates and film release dates for titles you follow, with regional cinema dates where available and a calendar export.",
  noindex: true,
});

export default function CalendarPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Release Calendar</h1>
        <p className="text-gray-400">
          Air dates for the series you are watching and release dates for the
          films on your watchlist. Regional cinema dates are used where available.
        </p>
      </div>

      <CalendarContent />
    </div>
  );
}
