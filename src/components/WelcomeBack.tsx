"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { getReleasesSinceLastVisit } from "@/app/actions";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { useEpisodeProgress } from "@/contexts/EpisodeProgressContext";
import {
  describeGap,
  isGapWorthShowing,
  recordVisit,
} from "@/lib/last-visit";
import { episodeCode } from "@/lib/calendar-ics";
import { getImageUrl } from "@/lib/tmdb-image";
import type { CalendarSeed } from "@/lib/release-calendar";
import type { MissedRelease } from "@/lib/since-last-visit-server";

/**
 * "Two of your shows aired while you were away."
 *
 * The most valuable thing a home page can do for somebody returning is be
 * different from how they left it. Everything else here is the same trending row
 * they saw last week; this strip is the part that rewards having come back.
 *
 * Renders nothing at all when there is nothing to say – which is most visits, and
 * is exactly why it lands when it does appear.
 */
export function WelcomeBack() {
  const { watchlist, isLoading: isWatchlistLoading } = useWatchlist();
  const { shows, isLoading: isProgressLoading } = useEpisodeProgress();

  const [previousVisit, setPreviousVisit] = useState<string | null>(null);
  const [releases, setReleases] = useState<MissedRelease[]>([]);
  const [dismissed, setDismissed] = useState(false);

  const isLoading = isWatchlistLoading || isProgressLoading;

  // Stamped once per tab session, and the previous stamp is what this whole
  // component is about – so it is captured before anything overwrites it.
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- reading and
       stamping a browser-only store, which the server render cannot do */
    setPreviousVisit(recordVisit());
  }, []);

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

    // A show being watched counts as followed even if it was never saved – it is
    // the one most likely to have aired something.
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

  const worthAsking = isGapWorthShowing(previousVisit) && seeds.length > 0;

  useEffect(() => {
    if (isLoading || !worthAsking || !previousVisit) return;

    let isCurrent = true;

    (async () => {
      try {
        const found = await getReleasesSinceLastVisit(
          seeds,
          previousVisit.slice(0, 10),
        );
        if (isCurrent) setReleases(found);
      } catch (error) {
        console.error("Error loading what happened since the last visit:", error);
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [seeds, previousVisit, worthAsking, isLoading]);

  if (dismissed || releases.length === 0 || !previousVisit) return null;

  return (
    <section
      aria-labelledby="welcome-back-heading"
      className="rounded-2xl border border-blue-500/30 bg-linear-to-br from-blue-500/10 to-purple-500/5 p-5"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2
            id="welcome-back-heading"
            className="text-lg font-semibold text-white flex items-center gap-2"
          >
            <Sparkles className="w-5 h-5 text-blue-400" aria-hidden="true" />
            Since you were here {describeGap(previousVisit)}
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            {releases.length} thing{releases.length === 1 ? "" : "s"} you follow
            came out.
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors shrink-0"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <ul className="flex gap-3 overflow-x-auto pb-1">
        {releases.map((release) => (
          <li key={release.key} className="shrink-0 w-32">
            <Link
              href={`/${release.mediaType}/${release.slug}`}
              prefetch={false}
              className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg"
            >
              <div className="relative aspect-2/3 rounded-lg overflow-hidden bg-gray-800 mb-2">
                {release.posterPath && (
                  <Image
                    src={getImageUrl(release.posterPath, "w185")}
                    alt={release.title}
                    fill
                    className="object-cover"
                  />
                )}
              </div>
              <p className="text-xs font-medium text-white group-hover:text-blue-300 transition-colors line-clamp-2">
                {release.title}
              </p>
              <p className="text-[11px] text-gray-500 line-clamp-1">
                {release.seasonNumber !== null && release.episodeNumber !== null
                  ? episodeCode(release.seasonNumber, release.episodeNumber)
                  : "In cinemas"}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
